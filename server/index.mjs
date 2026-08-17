/**
 * SMCHS live-data proxy.
 *
 * The app is a static, offline-first PWA with no server of its own. Browsers
 * can't fetch the school's feeds directly (CORS), so this tiny service fetches
 * the REAL smhs.org data server-side, normalizes it to the app's JSON shapes,
 * caches it, and serves it with permissive CORS.
 *
 * Sources:
 *   - Schedule & events → BellCalSync partner API (the school's source-of-truth
 *     calendar service; set CALENDAR_API_KEY). Falls back to parsing the
 *     CalendarWiz iCal feeds directly when no key is configured.
 *   - News    → Finalsite news listing (RSS is WAF-blocked, so we parse the page)
 *
 * No npm dependencies — Node built-ins only. Run: `node server/index.mjs`
 * Configure the app with NEXT_PUBLIC_API_BASE pointing at this server.
 */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { sendMail } from './mail.mjs';
import {
  recordMetricsEvents,
  metricsSummary,
  createSupportTicket,
  supportStatusForDevice,
  listSupportTickets,
  setSupportResolved,
} from './metrics.mjs';

const PORT = Number(process.env.PORT) || 8787;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const DATA_DIR = new URL('./.data/', import.meta.url);

/**
 * Write a file so a crash can never leave a half-written one behind. A bare
 * writeFileSync truncates first, so losing power mid-write yields truncated
 * JSON — and every loader here treats unparseable as "start empty", which then
 * persists the emptiness. Write to a temp file, fsync it, then rename (atomic
 * on POSIX): readers see either the old file or the new one, never a partial.
 */
function writeFileAtomic(fileUrl, contents) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = new URL(`${fileUrl.pathname.split('/').pop()}.${process.pid}.tmp`, DATA_DIR);
  // 0600: the SQLite stores next to these files hold real secrets (push.db
  // the VAPID private key, auth.db password hashes), so nothing under .data/
  // should be readable by other local accounts.
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, fileUrl);
}

const SOURCES = {
  // The school's Master Calendar (CalendarWiz). The cid[] list selects the real
  // event calendars; the default feed is only the bell-schedule annotation rows.
  ical:
    'https://www.calendarwiz.com/CalendarWiz_iCal.php?crd=santamargaritachs' +
    '&cid[]=319910&cid[]=320002&cid[]=320545&cid[]=319983',
  // Default feed = the "SMCHS Bell Schedule" calendar. Each school day's event
  // encodes the day type + rotation day (SUMMARY) and the exact per-period times
  // (DESCRIPTION) — the real, per-date, rotated schedule.
  bell: 'https://www.calendarwiz.com/CalendarWiz_iCal.php?crd=santamargaritachs',
  // The school's "Weekly Announcements" board (ETV announcements page).
  weekly: 'https://www.smhs.org/other/parents/etv-announcements',
  // The school's Faculty & Staff directory (Finalsite constituent manager).
  staff: 'https://www.smhs.org/about/facultystaff',
  // Campus-life pages (Finalsite CMS) — scraped into small JSON feeds so the
  // app shows the REAL menu / clubs / campus map / safety info, never placeholders.
  dining: 'https://www.smhs.org/campus-life/campusdining',
  clubs: 'https://www.smhs.org/campus-life/clubs',
  campus: 'https://www.smhs.org/about/our-campus',
  safety: 'https://www.smhs.org/campus-life/safety-and-security',
};

const SMHS = 'https://www.smhs.org';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// ---- tiny fetch + cache -----------------------------------------------------

function fetchText(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,text/calendar,*/*',
          ...extraHeaders,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchText(new URL(res.headers.location, url).toString(), extraHeaders));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

const cache = new Map(); // key -> { at, value }
// After an upstream failure, serve the stale copy and don't retry the source
// for this long — thousands of clients must never turn into a retry storm.
const STALE_RETRY_MS = 60 * 1000;
const inflight = new Map();

// Hard ceiling on distinct cache keys. Validation bounds each key's shape, but
// a cache that only ever grows is one bug away from an out-of-memory crash —
// and a crash is what opens the corrupt-file paths. Oldest entries go first.
const MAX_CACHE_ENTRIES = 500;

function evictIfFull() {
  if (cache.size < MAX_CACHE_ENTRIES) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [k] of oldest.slice(0, Math.ceil(MAX_CACHE_ENTRIES / 4))) cache.delete(k);
}

async function cached(key, producer, ttlMs = CACHE_TTL_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  // Single-flight: however many requests arrive while a refresh is running,
  // exactly one upstream fetch happens; the rest await the same promise.
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await producer();
      evictIfFull();
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      if (hit) {
        // Serve-stale: an expired copy beats an error while the source is
        // down. Backdate it so the next upstream attempt waits STALE_RETRY_MS.
        cache.set(key, { at: Date.now() - ttlMs + STALE_RETRY_MS, value: hit.value });
        return hit.value;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// ---- iCal (events) ----------------------------------------------------------

function unfoldIcs(text) {
  // RFC5545 line folding: continuation lines start with space/tab.
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

const TZ = 'America/Los_Angeles';
const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * Parse an iCal date/time value to the school timezone. Handles all-day dates,
 * UTC instants (…Z — converted to Pacific), and midnight-UTC rows (treated as
 * all-day so they don't shift to 5pm the previous day).
 */
function icsDate(val) {
  const m = String(val).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (hh === undefined) return { date: `${y}-${mo}-${d}` }; // all-day
  if (z) {
    if (hh === '00' && mm === '00' && (ss ?? '00') === '00') {
      return { date: `${y}-${mo}-${d}` }; // midnight UTC ⇒ treat as all-day
    }
    const inst = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)));
    return { date: DATE_FMT.format(inst), time: TIME_FMT.format(inst) };
  }
  // Naive datetime (no zone) — assume Pacific wall time.
  const h = Number(hh);
  const ap = h >= 12 ? 'PM' : 'AM';
  return { date: `${y}-${mo}-${d}`, time: `${h % 12 || 12}:${mm} ${ap}` };
}

function categorize(title) {
  const t = title.toLowerCase();
  if (/(mass|liturgy|prayer|retreat|ministry|chapel|adoration|reconciliation)/.test(t)) return 'ministry';
  if (
    /( vs\.? | @ |tournament|tourn|cif|playoff|invitational|scrimmage|fball|football|wp|water polo|volleyball|tennis|soccer|basketball|golf|swim|lacrosse|cross country|baseball|softball|track|wrestling|flag|\bbball\b)/.test(
      t,
    ) ||
    /\b(v|jv|fs|frosh|varsity)\b.*( vs | @ )/.test(t)
  )
    return 'athletics';
  if (/(concert|theatre|theater|recital|choir|band|orchestra|musical|\bplay\b|gallery|dance show|art show|talon)/.test(t))
    return 'arts';
  if (/(rally|spirit|club|fair|social|prom|homecoming|formal|mixer|reunion)/.test(t)) return 'campus-life';
  if (/(no school|holiday|break|closed|day off)/.test(t)) return 'holiday';
  return 'academic';
}

function unescapeIcs(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function parseEvents(icsText) {
  const text = unfoldIcs(icsText);
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  const events = [];
  for (const block of blocks) {
    const body = block.split('END:VEVENT')[0];
    const get = (name) => {
      const re = new RegExp(`(?:^|\\n)${name}[^:\\n]*:(.*)`, 'i');
      const m = body.match(re);
      return m ? m[1].trim() : '';
    };
    const summaryRaw = unescapeIcs(get('SUMMARY'));
    if (!summaryRaw) continue;
    // Skip the calendar's bell-schedule annotation rows (e.g. "*Classes 8:00am..",
    // "**Special Regular Schedule Day 1") — those drive day types, not events.
    if (/^\*/.test(summaryRaw)) continue;

    const start = icsDate(get('DTSTART'));
    if (!start) continue;
    const endRaw = icsDate(get('DTEND'));
    // iCal DTEND for all-day events is exclusive; treat single-day as no endDate.
    let endDate;
    if (endRaw && endRaw.date > start.date) {
      const d = new Date(`${endRaw.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      const adj = d.toISOString().slice(0, 10);
      if (adj > start.date) endDate = adj;
    }
    const uid = get('UID') || `${start.date}-${summaryRaw}`;
    const location = unescapeIcs(get('LOCATION')) || undefined;

    events.push({
      id: `wiz-${uid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
      date: start.date,
      ...(endDate ? { endDate } : {}),
      title: summaryRaw,
      category: categorize(summaryRaw),
      ...(start.time ? { time: start.time } : {}),
      ...(location ? { location } : {}),
    });
  }
  return events;
}

// ---- Per-date schedule (the real, rotated bell schedule) --------------------

/** Times in the DESCRIPTION have no am/pm. School runs 8:00–~15:00, so hours
 *  1–6 are PM; 7–12 are morning/noon. Returns "HH:mm". */
function to24(t) {
  let [h, m] = t.split(':').map(Number);
  if (h <= 6) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const LABEL_RE = /Per(?:iod)?\s*\d+|Lunch|Mass|Mtg|PLC[A-Za-z ]*|Meeting|Rally|Assembly|Break|Activity|Advis[a-z]*/gi;

// Split Mass / Split Assembly days describe the SAME window twice — once as a
// clean column ("Period 4/Masses  9:25-12:05") and again as per-grade prose
// ("Fr/So: attend Period 4 from 9:25-10:40", "complete Period 4 from 10:50-…",
// "dismissed to Mass … (9:30-10:40)"). Those prose lines carry embedded time
// ranges, so the naive parser turned each into a bogus overlapping period
// (Period 4 three times + two Masses). Real schedule columns are noun phrases;
// the grade-split prose is always a sentence built on one of these verbs. Drop
// those lines so only the clean combined block survives.
const NARRATIVE_RE = /\b(attend|complete|dismissed|report)\b/i;

// A line that is ONLY a time range. Some days (esp. the first week of the year)
// put the label on one line and its time on the NEXT ("Period 7" ⏎ "8:00-8:45")
// instead of the usual same-line "Period 7   8:00-8:45". The dash is optional to
// tolerate feed typos like "12:0012:35" (a real one in the Aug 25 data).
const BARE_TIME_RE = /^(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})$/;

function classifyPeriod(label, start, end, track) {
  const l = label.trim();
  const per = l.match(/Per(?:iod)?\s*(\d+)/i);
  const base = { start, end, ...(track ? { track } : {}) };
  if (per) {
    const n = Number(per[1]);
    return { id: `p${n}${track ? '-' + track : ''}`, label: `Period ${n}`, kind: 'class', periodNumber: n, ...base };
  }
  if (/lunch/i.test(l))
    return { id: `lunch${track ? '-' + track : ''}`, label: track === 'first' ? 'First Lunch' : track === 'second' ? 'Second Lunch' : 'Lunch', kind: 'lunch', ...base };
  if (/mass/i.test(l)) return { id: 'mass', label: 'Mass', kind: 'special', ...base };
  if (/mtg|plc|meeting/i.test(l)) return { id: 'meeting', label: 'Staff Meeting', kind: 'special', ...base };
  if (/rally|assembly/i.test(l)) return { id: 'rally', label: 'Rally / Assembly', kind: 'special', ...base };
  if (/break/i.test(l)) return { id: 'break', label: 'Break', kind: 'break', ...base };
  return { id: l.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16) || 'event', label: l, kind: 'special', ...base };
}

function parseDayDescription(desc) {
  const lines = desc
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/_+/g, ' ')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((l) => !/^\(/.test(l) && !/^Contact:/i.test(l))
    .filter((l) => !NARRATIVE_RE.test(l));

  const periods = [];
  const timeRe = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const times = [...line.matchAll(timeRe)];
    if (times.length === 0) {
      const next = lines[i + 1] || '';
      const nts = [...next.matchAll(timeRe)];
      const bare = next.match(BARE_TIME_RE);
      if (nts.length >= 2) {
        // Dual-lunch header (two labels); times are on the next line, two columns.
        const labels = (line.match(LABEL_RE) || []).slice(0, 2);
        if (labels.length === 2) {
          periods.push(classifyPeriod(labels[0], to24(nts[0][1]), to24(nts[0][2]), 'first'));
          periods.push(classifyPeriod(labels[1], to24(nts[1][1]), to24(nts[1][2]), 'second'));
          i++; // consume the times line
        }
      } else if (bare && (line.match(LABEL_RE) || []).length) {
        // Separate-line format: this line is the label, its time is the next line.
        periods.push(classifyPeriod(line, to24(bare[1]), to24(bare[2])));
        i++; // consume the time line
      }
    } else {
      const preLabel = line.slice(0, times[0].index);
      const between =
        times.length >= 2 ? line.slice(times[0].index + times[0][0].length, times[1].index) : '';
      if (times.length === 2 && preLabel.includes('/') && between.includes('/')) {
        // Combined dual-lunch line, both tracks on ONE line:
        //   "<1st-track>/<2nd-track>: <time1>/<time2>"
        // e.g. "1st Lunch/Period 3: 10:35-11:10/10:40-11:25" — the left of each
        // "/" is the first-lunch track, the right is the second. (Used by the
        // All Periods day; the two-column format above puts them on two lines.)
        const [aLabel = '', bLabel = ''] = preLabel.replace(/^[\s-]+/, '').split('/');
        periods.push(classifyPeriod(aLabel, to24(times[0][1]), to24(times[0][2]), 'first'));
        periods.push(classifyPeriod(bLabel, to24(times[1][1]), to24(times[1][2]), 'second'));
      } else {
        const m = times[0];
        const label = line.slice(0, m.index).trim();
        if (label) periods.push(classifyPeriod(label, to24(m[1]), to24(m[2])));
      }
    }
  }
  return assignImplicitTracks(periods).sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Separate-line dual-lunch days list two lunches and two copies of the split
 * block with no column to mark first/second (unlike the two-column format). Infer
 * the tracks from the clock: the earlier lunch is First, the later is Second; and
 * of the two split-block copies the later-starting one is for First-lunch students
 * (they already ate), the earlier one for Second. No-op on days that don't match
 * this exact shape (single-lunch days, or two-column days already tracked).
 */
function assignImplicitTracks(periods) {
  const lunches = periods.filter((p) => p.kind === 'lunch' && !p.track);
  const byNum = {};
  for (const p of periods) {
    if (p.kind === 'class' && !p.track && p.periodNumber) (byNum[p.periodNumber] ??= []).push(p);
  }
  const dup = Object.values(byNum).filter((g) => g.length === 2);
  if (lunches.length !== 2 || dup.length !== 1) return periods;

  const [lEarly, lLate] = lunches.sort((a, b) => a.start.localeCompare(b.start));
  Object.assign(lEarly, { track: 'first', id: 'lunch-first', label: 'First Lunch' });
  Object.assign(lLate, { track: 'second', id: 'lunch-second', label: 'Second Lunch' });

  const [bEarly, bLate] = dup[0].sort((a, b) => a.start.localeCompare(b.start));
  Object.assign(bEarly, { track: 'second', id: `${bEarly.id}-second` });
  Object.assign(bLate, { track: 'first', id: `${bLate.id}-first` });
  return periods;
}

/**
 * Split-mass days are a GRADE split (Jr/Sr vs Fr/So), NOT a lunch split. Both
 * grades share the opening period, Lunch, and the closing period; only the
 * middle "Period Y / Masses" window (9:25–12:05) diverges by grade:
 *   Jr/Sr: report to Period Y for attendance → Mass (9:30–10:40) → finish
 *          Period Y (10:50–12:05)
 *   Fr/So: Period Y (9:25–10:40) → Mass (10:50–12:05)
 * We tag the diverging cells with `group` ('jrsr' | 'frso') and a `note`, and the
 * client renders them as two side-by-side columns. The shared periods stay
 * ungrouped (full-width). The generic parser can't handle this — it's prose — so
 * split-mass days route here instead.
 */
function parseSplitMass(desc) {
  const lines = desc
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/_+/g, ' ')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((l) => !/^\(/.test(l) && !/^Contact:/i.test(l));

  const T = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;
  const periods = [];
  let splitBlock = null;

  for (const line of lines) {
    // "Period Y/Masses 9:25-12:05" names the diverging block; times come from the
    // per-grade prose below, so we only capture Y here.
    if (/\/\s*Mass/i.test(line)) {
      const per = line.match(/Period\s*(\d+)/i);
      if (per) splitBlock = Number(per[1]);
      continue;
    }
    // Skip per-grade prose (handled from the joined text); keep shared periods.
    if (/^(Jr\/Sr|Fr\/So)\b/i.test(line) || NARRATIVE_RE.test(line) || /passing/i.test(line)) continue;
    const t = line.match(T);
    if (t) {
      const label = line.slice(0, t.index).trim();
      if (label) periods.push(classifyPeriod(label, to24(t[1]), to24(t[2])));
    }
  }

  if (splitBlock != null) {
    const text = lines.join(' ');
    const grab = (re) => {
      const m = text.match(re);
      return m ? { s: to24(m[1]), e: to24(m[2]) } : null;
    };
    const jrsrMass = grab(/dismissed to Mass[^(]*\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/i);
    const jrsrPer = grab(/complete Period\s*\d+\s*from\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
    const frsoPer = grab(/attend Period\s*\d+\s*from\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
    const frsoMass = grab(/attend Mass[^0-9]*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
    const report = (text.match(/report to Period\s*\d+\s*at\s*(\d{1,2}:\d{2})/i) || [])[1];

    if (jrsrMass && jrsrPer && frsoPer && frsoMass) {
      periods.push({
        id: 'mass-jrsr',
        label: 'Mass',
        kind: 'special',
        group: 'jrsr',
        start: jrsrMass.s,
        end: jrsrMass.e,
        ...(report ? { note: `Period ${splitBlock} attendance at ${report}` } : {}),
      });
      periods.push({
        id: `p${splitBlock}-jrsr`,
        label: `Period ${splitBlock}`,
        kind: 'class',
        periodNumber: splitBlock,
        group: 'jrsr',
        start: jrsrPer.s,
        end: jrsrPer.e,
      });
      periods.push({
        id: `p${splitBlock}-frso`,
        label: `Period ${splitBlock}`,
        kind: 'class',
        periodNumber: splitBlock,
        group: 'frso',
        start: frsoPer.s,
        end: frsoPer.e,
      });
      periods.push({
        id: 'mass-frso',
        label: 'Mass',
        kind: 'special',
        group: 'frso',
        start: frsoMass.s,
        end: frsoMass.e,
      });
    }
  }

  return periods.sort((a, b) => a.start.localeCompare(b.start));
}

function parseDaySummary(summary) {
  const s = summary.replace(/^\*+/, '').trim();
  if (/holiday|break|recess|no school/i.test(s)) {
    return { school: false, label: s.replace(/\s*-\s*(Full School|Faculty\/Student|Student|Faculty).*$/i, '').trim(), short: 'No School' };
  }
  if (/exam/i.test(s)) return { school: true, label: s, short: 'Exams' };
  const m = s.match(/^(.*?)\s+(?:Schedule\s+)?Day\s+(\d+)/i);
  if (m) {
    // Match the official calendar's wording EXACTLY: keep the full name (including
    // a leading "Special") and only drop the redundant "Schedule" word and the
    // rotation number. So "**Special Regular Schedule Day 1" → "Special Regular Day",
    // "**Special Meeting Schedule Day 5" → "Special Meeting Day",
    // "**Special Mass Schedule Day 1" → "Special Mass Day",
    // "**Split Mass Schedule Day 3" → "Split Mass Day".
    const name = m[1].replace(/\bSchedule\b/i, ' ').replace(/\s+/g, ' ').trim();
    if (name && name.toLowerCase() !== 'special') {
      // Pill stays compact: the rotation type without the "Special" qualifier.
      return { school: true, label: `${name} Day`, short: name.replace(/^Special\s+/i, ''), rotationDay: Number(m[2]) };
    }
    // Bare "Special Schedule Day N" — no rotation-type word; keep "Schedule" so the
    // name still reads meaningfully instead of collapsing to " Day".
    return { school: true, label: 'Special Schedule Day', short: 'Special', rotationDay: Number(m[2]) };
  }
  return { school: true, label: s, short: s.split(' ').slice(0, 2).join(' ') };
}

function parseSchedule(icsText) {
  const text = unfoldIcs(icsText);
  const blocks = text.split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]);
  const days = {};
  for (const b of blocks) {
    const summary = unescapeIcs((b.match(/\nSUMMARY:(.*)/) || [])[1] || '');
    if (!summary.startsWith('**')) continue; // only the day-defining rows
    const dt = icsDate((b.match(/DTSTART[^:\n]*:(.*)/) || [])[1] || '');
    if (!dt) continue;
    const meta = parseDaySummary(summary);
    const desc = (b.match(/\nDESCRIPTION:(.*)/) || [])[1] || '';
    const periods = !meta.school
      ? []
      : /split\s+mass/i.test(summary)
        ? parseSplitMass(desc)
        : parseDayDescription(desc);
    days[dt.date] = {
      label: meta.label,
      short: meta.short,
      school: meta.school && periods.length > 0,
      ...(meta.rotationDay ? { rotationDay: meta.rotationDay } : {}),
      periods,
    };
  }
  return days;
}

// ---- BellCalSync partner API (primary schedule/events source) ----------------
//
// The school's calendar service serves the bell schedule, sports, and campus
// events as structured JSON and hosts auto-refreshing calendar subscriptions
// (webcal/ICS) — replacing the CalendarWiz iCal parsing above, which stays only
// as the keyless fallback. Integration rules (per the partner docs):
//   - The key is server-side ONLY (CALENDAR_API_KEY env var) — never shipped to
//     the app bundle or browser; this proxy is the only thing that holds it.
//   - The API is additive-only: enums (buildings, sports, schedule types) are
//     read live from /meta and /sports, never hard-coded.

const CAL_API_BASE =
  process.env.CALENDAR_API_BASE || 'https://bellcalsync-production.up.railway.app/api/v1';
const CAL_API_KEY = process.env.CALENDAR_API_KEY || '';
const calConfigured = () => Boolean(CAL_API_KEY);

const META_TTL_MS = 24 * 60 * 60 * 1000; // vocabulary + school-year bounds
const SPORTS_TTL_MS = 6 * 60 * 60 * 1000;

/** Authenticated JSON request to the calendar API. Throws on any non-2xx. */
function calApi(path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    if (!calConfigured()) return reject(new Error('CALENDAR_API_KEY not configured'));
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      new URL(CAL_API_BASE + path),
      {
        method,
        headers: {
          'X-API-Key': CAL_API_KEY,
          Accept: 'application/json',
          'User-Agent': 'smchs-app-proxy',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            /* non-JSON error body */
          }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
          const err = new Error(json?.error?.message || `calendar API HTTP ${res.statusCode}`);
          err.status = res.statusCode;
          err.body = json;
          reject(err);
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('calendar API timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

const calMeta = () => cached('cal-meta', () => calApi('/meta'), META_TTL_MS);

/** Inclusive [start, end] ISO-date windows of at most `span` days. */
function dateWindows(startIso, endIso, span) {
  const windows = [];
  let s = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (s <= end) {
    const e = new Date(s);
    e.setUTCDate(e.getUTCDate() + span - 1);
    const winEnd = e < end ? e : end;
    windows.push([s.toISOString().slice(0, 10), winEnd.toISOString().slice(0, 10)]);
    s = new Date(winEnd);
    s.setUTCDate(s.getUTCDate() + 1);
  }
  return windows;
}

const GRADE_GROUP = { 'Jr/Sr': 'jrsr', 'Fr/So': 'frso' };

/** One API ScheduleDay → the app's LiveDay (label/short/school/periods). */
function calDayToLiveDay(day) {
  const periods = [];
  for (const p of day.periods || []) {
    const track = p.lunchType === 'first' || p.lunchType === 'second' ? p.lunchType : undefined;
    const group = GRADE_GROUP[p.gradeLevel];
    const base = {
      start: p.start,
      end: p.end,
      ...(track ? { track } : {}),
      ...(group ? { group } : {}),
      ...(p.location ? { note: p.location } : {}),
    };
    if (p.period === 'lunch') {
      periods.push({
        id: `lunch${track ? `-${track}` : ''}${group ? `-${group}` : ''}`,
        label: track === 'first' ? 'First Lunch' : track === 'second' ? 'Second Lunch' : 'Lunch',
        kind: 'lunch',
        ...base,
      });
    } else {
      const n = Number(p.period);
      periods.push({
        id: `p${n}${track ? `-${track}` : ''}${group ? `-${group}` : ''}`,
        label: `Period ${n}`,
        kind: 'class',
        periodNumber: n,
        ...base,
      });
    }
  }
  // Timed special blocks (Mass, Meeting, Rally, testing…). classifyPeriod gives
  // them the same ids/kinds the app already renders; grade-split copies get a
  // group suffix so ids stay unique (e.g. mass-jrsr / mass-frso).
  for (const ev of day.specialEvents || []) {
    if (!ev.start || !ev.end) continue;
    const group = GRADE_GROUP[ev.gradeLevel];
    const base = classifyPeriod(ev.title, ev.start, ev.end);
    periods.push(group ? { ...base, id: `${base.id}-${group}`, group } : base);
  }
  periods.sort((a, b) => a.start.localeCompare(b.start));
  const label = day.scheduleType === 'Regular' ? 'Regular Day' : day.scheduleType;
  return {
    label,
    short: day.scheduleType.replace(/\s+Day$/i, ''),
    school: periods.length > 0,
    periods,
  };
}

/**
 * The whole school year's per-date schedule (date → LiveDay). The API caps
 * /schedule at 60 days per call, so the year is stitched from windows. Dates the
 * API doesn't return are not school days — same contract the app already has.
 */
async function calSchedule() {
  const meta = await calMeta();
  const { startDate, endDate } = meta.schoolYear;
  const days = {};
  for (const [s, e] of dateWindows(startDate, endDate, 60)) {
    const j = await calApi(`/schedule?start=${s}&end=${e}`);
    for (const day of j.days || []) days[day.date] = calDayToLiveDay(day);
  }
  return days;
}

// ---- Schedule history ---------------------------------------------------------
// The upstream calendars only serve the current window: once a day rolls off the
// feed its schedule is gone for good. Every fetch is folded into a history file
// so past days stay servable forever — the app's calendar can step back through
// them. Fresh data wins for any date the feed still returns.

const SCHEDULE_HISTORY_FILE = new URL('./.data/schedule-history.json', import.meta.url);

function withScheduleHistory(freshDays) {
  let history = {};
  let readable = true;
  try {
    history = JSON.parse(fs.readFileSync(SCHEDULE_HISTORY_FILE, 'utf8'));
    if (!history || typeof history !== 'object' || Array.isArray(history)) throw new Error('shape');
  } catch (err) {
    // Missing file = first run. Anything else means the archive is there but
    // unreadable — merging onto {} and saving would erase every past day the
    // upstream feed no longer serves, which is the entire point of this file.
    if (err.code !== 'ENOENT') {
      console.error('[schedule-history] unreadable, not overwriting:', err.message);
      readable = false;
    }
    history = {};
  }
  // A day the feed suddenly reports as having no periods does not disprove the
  // full schedule we archived for it; keep the richer record.
  const merged = { ...history };
  for (const [date, day] of Object.entries(freshDays)) {
    const prev = merged[date];
    if (prev?.periods?.length && !day?.periods?.length) continue;
    merged[date] = day;
  }
  if (readable) {
    try {
      writeFileAtomic(SCHEDULE_HISTORY_FILE, JSON.stringify(merged));
    } catch {
      /* read-only disk: still serve the merged view */
    }
  }
  return merged;
}

// ---- Event history ------------------------------------------------------------
// Same problem as the schedule, one important difference. The calendars only
// serve the current school year, so last year's games and concerts vanish the
// moment the year rolls over — worth archiving. But unlike a date, an EVENT can
// be cancelled, and an archive that kept everything would resurrect a cancelled
// game forever and show it as though it were still on.
//
// So only the PAST is archived. Anything from today forward is served straight
// from the feed and stays cancellable; once a day has elapsed, what was on the
// calendar that day is kept. Fresh data still wins for any event the feed
// returns, so a late correction to a past event lands.

const EVENT_HISTORY_FILE = new URL('./.data/event-history.json', import.meta.url);
/** Archived events older than this are dropped, bounding the file's growth. */
const EVENT_HISTORY_YEARS = 5;

/** The last date an event occupies — a multi-day run isn't past until it ends. */
const eventEndsOn = (e) => e?.endDate || e?.date || '';

/**
 * The archive's primary key. Deliberately NOT the event's `id`.
 *
 * `id` is built for display and is truncated to 64 characters, with the start
 * time appended LAST — so the time, the only thing separating a matinee from an
 * evening show, is the first thing truncation eats. The live feed already
 * carries four titles long enough to hit that cap, one of them
 * "Chamber Singers, Advanced Women's Chorus & Concert Choir Pops Concert":
 * a 2pm and a 7pm performance of it produce byte-identical ids. Keying an
 * archive on that loses one of the two shows, in a file whose whole job is not
 * losing things.
 *
 * Hashing the fields that actually distinguish an event sidesteps the length
 * limit entirely, and stays stable across fetches so the same event keeps
 * mapping to the same record.
 */
function eventKey(e) {
  const parts = [e?.date, e?.endDate, e?.title, e?.time, e?.location].map((v) => v ?? '');
  return crypto.createHash('sha256').update(parts.join(' ')).digest('hex').slice(0, 24);
}

function readEventHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(EVENT_HISTORY_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    return { events: parsed, readable: true };
  } catch (err) {
    // Missing file = first run. Anything else means the archive exists but can't
    // be read, and merging onto {} would erase every past event the feed no
    // longer serves — the entire point of the file.
    if (err.code === 'ENOENT') return { events: {}, readable: true };
    console.error('[event-history] unreadable, not overwriting:', err.message);
    return { events: {}, readable: false };
  }
}

/**
 * Fold a fresh event list into the archive. Returns the fresh list untouched:
 * this is a writer, and /api/events keeps answering with exactly what the feed
 * says unless history is asked for.
 *
 * The caller must pass a COMPLETE set, never a filtered subset — a `?sport=`
 * query returns only that team's games and may include tentative ones the
 * default view hides, which is no basis for an archive. Both call sites satisfy
 * this differently and both are checked at the call site, not here.
 */
function archiveEvents(freshEvents) {
  const today = DATE_FMT.format(new Date());
  const { events: history, readable } = readEventHistory();
  if (!readable) return freshEvents;

  // Rebuild from the VALUES rather than spreading the old map: keys are derived
  // from content, so this re-keys anything written under an older scheme (the
  // truncation-prone `id`) and drops junk rows in the same pass.
  const merged = {};
  for (const e of Object.values(history)) {
    if (e?.date) merged[eventKey(e)] = e;
  }
  for (const e of freshEvents) {
    if (!e?.date) continue;
    if (eventEndsOn(e) >= today) continue; // still ahead: cancellable, not history
    merged[eventKey(e)] = e;
  }

  // Drop what has aged out. Without this, an upstream title edit (which changes
  // the derived key) leaves the old record behind forever.
  const cutoffYear = Number(today.slice(0, 4)) - EVENT_HISTORY_YEARS;
  const cutoff = `${cutoffYear}${today.slice(4)}`;
  for (const [key, e] of Object.entries(merged)) {
    if (eventEndsOn(e) < cutoff) delete merged[key];
  }

  try {
    writeFileAtomic(EVENT_HISTORY_FILE, JSON.stringify(merged));
  } catch {
    /* read-only disk: the live answer is unaffected */
  }
  return freshEvents;
}

/**
 * The live list plus every archived past event the feed no longer carries, in
 * date order. Fresh wins, so an event still in the feed is served as the feed
 * has it now, not as it was archived.
 *
 * Keyed by content (see eventKey), not by the stored key, so an archive written
 * under the old id-based scheme merges correctly without a migration step.
 *
 * Reads and parses the archive, so callers cache it — at five years of
 * retention this is a few hundred KB of synchronous work, and /api/events is
 * public and unmetered.
 */
function withEventHistory(freshEvents) {
  const { events: history } = readEventHistory();
  const byKey = new Map();
  for (const e of Object.values(history)) if (e?.date) byKey.set(eventKey(e), e);
  for (const e of freshEvents) if (e?.date) byKey.set(eventKey(e), e);
  return [...byKey.values()].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || (a.title || '').localeCompare(b.title || ''),
  );
}

/** "15:00" → "3:00 PM" (the free-text `time` shape the app's events use). */
function to12h(hm) {
  const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

const isoPlusOne = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * API CategoryEvents → the app's SchoolEvent shape. Sports map to the app's
 * "athletics" category; campus events are bucketed by the same keyword rules the
 * iCal path used. Multi-day happenings arrive as one all-day row per day, so
 * consecutive same-title runs are merged back into date..endDate ranges.
 */
function calToSchoolEvents(events) {
  const out = [];
  const runs = new Map(); // title|category|location -> { proto, dates[] }
  const mk = (e, category, date, endDate) => ({
    id: `bcs-${date}-${e.title}${e.startTime || ''}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
    date,
    ...(endDate ? { endDate } : {}),
    title: e.title,
    category,
    ...(e.startTime ? { time: to12h(e.startTime) } : {}),
    ...(e.location ? { location: e.location } : {}),
    ...(e.isTentative ? { tentative: true } : {}),
  });
  for (const e of events) {
    if (e.category === 'classtimes') continue; // the schedule feed already covers class times
    const category = e.category === 'sports' ? 'athletics' : categorize(e.title);
    if (!e.allDay || e.category === 'sports') {
      out.push(mk(e, category, e.date));
      continue;
    }
    const key = `${e.title}|${category}|${e.location || ''}`;
    if (!runs.has(key)) runs.set(key, { proto: e, category, dates: [] });
    runs.get(key).dates.push(e.date);
  }
  for (const { proto, category, dates } of runs.values()) {
    dates.sort();
    let start = dates[0];
    let prev = dates[0];
    for (let i = 1; i <= dates.length; i++) {
      const d = dates[i];
      if (d && d === isoPlusOne(prev)) {
        prev = d;
        continue;
      }
      out.push(mk(proto, category, start, prev > start ? prev : undefined));
      start = prev = d;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** School-year event feed (optionally filtered to one team for previews). */
async function calEvents({ sport, gender, tentative } = {}) {
  const meta = await calMeta();
  const { startDate, endDate } = meta.schoolYear;
  const q = new URLSearchParams({ start: startDate, end: endDate });
  if (sport) {
    q.set('category', 'sports');
    q.set('sport', sport);
    if (gender) q.set('gender', gender);
    if (tentative) q.set('includeTentative', 'true');
  } else {
    q.set('category', 'sports,other');
  }
  const j = await calApi(`/events?${q}`);
  return calToSchoolEvents(j.events || []);
}

// ---- News (announcements) ---------------------------------------------------

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/** Reduce arbitrary post HTML to a safe, well-formatted subset for rendering. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a',
]);

/**
 * Reduce scraped CMS HTML to a small, safe subset. This output is rendered with
 * dangerouslySetInnerHTML, so it must be allowlist-first: EVERY tag is rebuilt
 * from scratch and every attribute dropped, except a re-validated http(s) href
 * on <a>. Patching individual bad patterns is not enough — an earlier version
 * only rewrote double-quoted href and let `<a href='javascript:…'>` and
 * `<br onmouseover=…>` straight through.
 */
function sanitizeHtml(h) {
  const stripped = h
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|form|button|svg|noscript)[\s\S]*?<\/\1>/gi, '');

  const rebuilt = stripped.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, rawName, attrs) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    const closing = _m.startsWith('</');
    if (closing) return `</${name}>`;
    if (name !== 'a') return `<${name}>`; // every attribute dropped
    // href may be quoted with " or ' or unquoted; all three forms are checked
    // against the same http(s) allowlist, and nothing else survives.
    const m =
      /href\s*=\s*"([^"]*)"/i.exec(attrs) ||
      /href\s*=\s*'([^']*)'/i.exec(attrs) ||
      /href\s*=\s*([^\s>]+)/i.exec(attrs);
    const href = m ? m[1].trim() : '';
    if (!/^https?:\/\//i.test(href) || /["<>]/.test(href)) return '<a>';
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
  });

  return rebuilt
    .replace(/(\s*<br>\s*){3,}/gi, '<br><br>')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const NAMED_ENTITIES = {
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  amp_lt: '<',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|quot|apos|nbsp|lsquo|rsquo|ldquo|rdquo|mdash|ndash|hellip|eacute|egrave);/g,
      (_, name) => NAMED_ENTITIES[name] ?? _)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

const WEEKLY_PAGE_SIZE = 5;
// The board's element id (parsed from the listing once).
const weeklyElementId = (html) => (html.match(/id="fsEl_(\d+)"[^>]*data-board-id="\d+"/) || [])[1] || null;
const WEEKLY_POPUP = (eid, pid) =>
  `https://www.smhs.org/fs/elements/${eid}?is_popup=true&post_id=${pid}&show_post=true&is_draft=false`;
// "Load More" pagination: rows are 1-indexed, in pages of 5. The `_` cache-buster
// is required — without a unique URL the upstream serves the first page.
const WEEKLY_PAGE = (eid, startRow) =>
  `https://www.smhs.org/fs/elements/${eid}?start_row=${startRow}&is_draft=false&is_load_more=true&parent_id=${eid}&_=${Date.now()}`;
const XHR_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://www.smhs.org/other/parents/etv-announcements',
};

/** Parse a board fragment into post stubs (no bodies) + whether more pages exist. */
function parseWeeklyList(html) {
  const posts = [];
  const seen = new Set();
  const re =
    /<article[^>]*data-post-id="(\d+)"[\s\S]*?<a class="fsPostLink"[^>]*data-slug="[^"]*\/post\/([^"]+)"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const [, postId, , url, rawTitle] = m;
    if (seen.has(postId)) continue;
    seen.add(postId);
    posts.push({ id: `weekly-${postId}`, postId, title: decodeEntities(rawTitle), url });
  }
  return { posts, hasMore: /fsLoadMore|load more/i.test(html) };
}

/** Extract one weekly post: title + body (formatted HTML) + real date, from the popup. */
function parseWeeklyPost(html) {
  const postedAt = (html.match(/datetime="([^"]+)"/) || [])[1] || '';
  const titleM = html.match(/<div class="fsTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const title = titleM ? decodeEntities(stripTags(titleM[1])) : '';
  const start = html.indexOf('class="fsBody"');
  let bodyHtml = '';
  if (start >= 0) {
    const from = html.indexOf('>', start) + 1;
    let end = html.indexOf('fsComment', from);
    if (end < 0) end = from + 12000;
    bodyHtml = sanitizeHtml(html.slice(from, end));
  }
  return { title, postedAt, bodyHtml };
}

// ---- Faculty & Staff directory ----------------------------------------------
//
// The school's directory is a Finalsite "constituent" listing: paginated, with a
// department <select> whose numeric ids filter the list. Emails are obfuscated
// as REVERSED strings passed to FS.util.insertEmail("…", "gro.shms", "jitumledba")
// — reverse both to get user@domain. We scrape every department page so each
// person carries the department names they belong to (a person can be in
// several), which is what drives the app's teacher pickers.

const STAFF_TTL_MS = 25 * 60 * 60 * 1000; // daily interval refreshes; requests always serve cache

/** All fsConstituentItem cards on one directory page → {name,title,email}[]. */
function parseStaffItems(html) {
  const items = [];
  const blocks = html.split('fsConstituentItem').slice(1);
  for (const b of blocks) {
    // The name lives in fsFullName — usually inside a profile <a>, but some
    // cards have no profile link, so the anchor is optional.
    const name = (b.match(/fsFullName[^>]*>\s*(?:<a[^>]*>)?\s*([^<]+?)\s*</) || [])[1];
    if (!name) continue;
    const title = (b.match(/<div class="fsTitles">\s*([\s\S]*?)\s*<\/div>/) || [])[1] || '';
    const em = b.match(/insertEmail\("[^"]+",\s*"([^"]+)",\s*"([^"]+)"/);
    const email = em ? `${[...em[2]].reverse().join('')}@${[...em[1]].reverse().join('')}` : '';
    items.push({
      name: decodeEntities(name.replace(/\s+/g, ' ')),
      title: decodeEntities(title.replace(/\s+/g, ' ')),
      email: email.toLowerCase(),
    });
  }
  return items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polite fetch for the directory: spaced out, with backoff on 429 rate limits. */
async function fetchStaffPage(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const html = await fetchText(url);
      await sleep(300); // spacing — the site 429s bursts
      return html;
    } catch (err) {
      if (attempt >= 3 || !/429/.test(String(err))) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
}

/** Every page of one directory query (the listing paginates at 30/page). */
async function fetchStaffPages(params) {
  const first = await fetchStaffPage(`${SOURCES.staff}?${params}`);
  const pages = [first];
  const nums = [...first.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1]));
  const last = nums.length ? Math.max(...nums) : 1;
  for (let p = 2; p <= last; p++) {
    pages.push(await fetchStaffPage(`${SOURCES.staff}?${params}&const_page=${p}`));
  }
  return pages;
}

/** Scrape the whole directory: department list + every member with departments. */
async function scrapeStaff() {
  const main = await fetchText(SOURCES.staff);
  const sel = (main.match(/<select name="const_search_department">([\s\S]*?)<\/select>/) || [])[1] || '';
  const departments = [...sel.matchAll(/<option value="(\d+)">\s*([\s\S]*?)\s*<\/option>/g)].map(
    (m) => ({ id: m[1], name: decodeEntities(m[2].replace(/\s+/g, ' ')) }),
  );

  // key (email || name) -> person; departments accumulate across queries.
  const byKey = new Map();
  const add = (item, dept) => {
    const key = item.email || item.name.toLowerCase();
    const cur = byKey.get(key) ?? { ...item, departments: [] };
    if (dept && !cur.departments.includes(dept)) cur.departments.push(dept);
    if (!cur.title && item.title) cur.title = item.title;
    byKey.set(key, cur);
  };

  // Per-department pages — sequential on purpose; the site rate-limits bursts.
  for (const d of departments) {
    const pages = await fetchStaffPages(`const_search_department=${d.id}`);
    for (const page of pages) for (const item of parseStaffItems(page)) add(item, d.name);
  }

  // The unfiltered listing (note: the site only serves a subset of the roster
  // here — it clamps at 3 pages, ~90 people).
  for (const page of await fetchStaffPages('')) {
    for (const item of parseStaffItems(page)) add(item, null);
  }

  // A–Z last-name sweep: a single-letter keyword search returns everyone whose
  // LAST name starts with that letter — including staff hidden from the default
  // listing and tagged with no department at all (e.g. campus security). This is
  // the only query that reaches the complete roster, so it's what guarantees
  // nobody is missing. Search results cap at 30/page without a pager; if a
  // letter ever hits the cap, probe further pages defensively.
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    let page = 1;
    for (;;) {
      const html = await fetchStaffPage(
        `${SOURCES.staff}?const_search_keyword=${letter}${page > 1 ? `&const_page=${page}` : ''}`,
      );
      const items = parseStaffItems(html);
      for (const item of items) add(item, null);
      if (items.length < 30) break;
      page += 1;
    }
  }

  // Sort by last name, ignoring alumni-year suffixes ("Alicia Sayles '00").
  const lastName = (n) => n.replace(/\s*'\d\d\s*$/, '').split(' ').pop() ?? '';
  const staff = [...byKey.values()].sort(
    (a, b) => lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name),
  );
  return { departments: departments.map((d) => d.name), staff };
}

// ---- Campus life (dining, clubs, campus map, safety) --------------------------
//
// These pages are hand-maintained Finalsite content, so the scrapers stay
// deliberately loose: slice the main content region, pull out the stable
// landmarks (headings, tables, resource links), and return small JSON shapes.
// Everything is cached for hours — the pages change a few times a year.

const CAMPUS_TTL_MS = 6 * 60 * 60 * 1000;

/** The page's own content region: after the body wrapper, before the footer. */
function pageMain(html) {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const start = h.search(/class="fsPageBodyWrapper"/);
  if (start > 0) h = h.slice(start);
  const end = h.search(/footer-content-wrapper/);
  if (end > 0) h = h.slice(0, end);
  return h;
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** All anchors in a fragment as {href (absolute), label}. */
function anchorsOf(html) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: m[1].startsWith('http') ? m[1] : `${SMHS}${m[1]}`,
    label: textOf(m[2]),
  }));
}

/**
 * Campus Dining — Hanna's on Campus, parsed into STRUCTURE (not prose blobs):
 * a clean intro sentence, open/close hours, the payment methods as a list, the
 * lunch-by-building table as first/second columns, and the dining guidelines
 * as bullet points — plus the full-menu PDF and the menu section names.
 */
function parseDining(html) {
  const main = pageMain(html);
  const text = textOf(main);

  // Marketing sentence only — drop the page-title echo and the hours sentence
  // (hours get their own structured field below).
  const intro = ((text.match(/An extension of local favorite[\s\S]*?ingredients\./i) || [])[0] || '')
    .trim();

  const contact = (text.match(/[a-z0-9._-]+@smhs\.org/i) || [])[0] || '';

  // "available starting at 7:00 am and will close at 3:00 pm daily."
  const hm = text.match(/starting at\s*(\d{1,2}:\d{2}\s*[ap]m)[\s\S]*?close at\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
  const clock = (s) => s.toUpperCase().replace(/\s*([AP]M)/, ' $1');
  const hours = hm ? { open: clock(hm[1]), close: clock(hm[2]), daily: /daily/i.test(text) } : null;

  const payment = ((text.match(/Accepted forms of payment:\s*([^.]*)\./i) || [])[1] || '')
    .split(/,\s*/)
    .map((s) => s.replace(/^and\s+/i, '').trim())
    .filter(Boolean);

  const menuPdf = (anchorsOf(main).find((a) => /resource-manager/.test(a.href)) || {}).href || '';
  const sections = [...main.matchAll(/<(h[2-4])[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => textOf(m[2]))
    .filter((t) => /^(breakfast|lunch|lunch cont\.?|elite performance)$/i.test(t));

  // The lunch-by-building table: column 0 = 1st Lunch, column 2 = 2nd Lunch.
  const lunch = { first: [], second: [] };
  const tableM = main.match(/<table[\s\S]*?<\/table>/i);
  if (tableM) {
    const rows = [...tableM[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
      [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => textOf(c[1])),
    );
    for (const cells of rows) {
      const [a, , b] = [cells[0] || '', cells[1] || '', cells[cells.length - 1] || ''];
      if (/^1st lunch$/i.test(a) || /^2nd lunch$/i.test(b)) continue; // header
      const clean = (s) => s.replace(/\s+/g, ' ').replace(/\bHal l\b/, 'Hall'); // source typo
      if (a) lunch.first.push(clean(a));
      if (b && b !== a) lunch.second.push(clean(b));
    }
  }

  // Guidelines: the sentence list between the lead-in and the sign-off.
  const gm = text.match(/follow these guidelines:\s*([\s\S]*?)\s*Thank you for your cooperation/i);
  const guidelines = gm
    ? gm[1]
        .split(/(?<=\.)\s+(?=[A-Z])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 12)
    : [];

  return { title: "Hanna's on Campus", intro, hours, payment, contact, menuPdf, sections, lunch, guidelines };
}

/**
 * Student Clubs — the "2025 - 2026 Clubs" table: ONE cell per row holding the
 * whole club as prose: "Name - Category Description… Moderator: X email".
 * Split on those landmarks. Roughly 74 real clubs as of 2025-26.
 */
function parseClubs(html) {
  const main = pageMain(html);
  const clubs = [];
  const tableM = main.match(/<table[\s\S]*?<\/table>/i);
  if (tableM) {
    const rows = [...tableM[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
      textOf([...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]).join(' ')),
    );
    for (const row of rows) {
      if (!row || /^\d{4}\s*-\s*\d{4}\s+Clubs$/i.test(row)) continue; // header row
      // "Name - Category Rest…" — the category is the single capitalized word
      // right after the FIRST " - " (club names themselves can contain dashes
      // only inside parentheses on this page, so first wins).
      const m = row.match(/^(.{2,110}?)\s+-\s+([A-Z][A-Za-z/&]+)\b\s*(.*)$/s);
      if (!m) continue;
      const [, name, category, rest] = m;
      const email = (rest.match(/[a-z0-9._-]+@smhs\.org/i) || [])[0] || '';
      const moderator = ((rest.match(/Moderator:?\s*(.+?)(?:\s+[a-z0-9._-]+@|$)/i) || [])[1] || '')
        .replace(/\s+/g, ' ')
        .trim();
      const description = rest.replace(/Moderator:[\s\S]*$/i, '').trim();
      clubs.push({ name: name.trim(), category, description, moderator, email: email.toLowerCase() });
    }
  }
  const text = textOf(main);
  const rush = (text.match(/Fall Club Rush[\s\S]{0,200}?(?=\.|Spring)/i) || [''])[0].trim();
  return { year: (text.match(/(\d{4}\s*-\s*\d{4})\s+Clubs/i) || [])[1] || '', clubs, rush };
}

/** Normalize any US phone found after `label` to "(949) 555-1234". */
function phoneAfter(text, label) {
  const re = new RegExp(label.source + String.raw`[^0-9]{0,12}(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})`, 'i');
  const m = text.match(re);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : '';
}

/**
 * Our Campus — the official numbered building directory + the downloadable
 * campus map / locator resources. This is the live source the in-app map
 * cross-references against the app's own buildings config.
 */
function parseCampus(html) {
  const main = pageMain(html);
  const text = textOf(main);
  // "1. Welcome Center 2. Lyon Hall … 24. Eagle Athletic Center …"
  const listStart = text.search(/1\.\s*Welcome Center/i);
  const buildings = [];
  if (listStart >= 0) {
    // The last entry would otherwise run into the page footer ("Visit Inquire
    // Apply Give…" plus escaped markup), so end the window at the first footer
    // marker after the list.
    let list = text.slice(listStart, listStart + 2200);
    const footerAt = list.search(/\s(?:Visit\s+Inquire|\(opens in new window|Apply\s+Give|<)/i);
    if (footerAt > 0) list = list.slice(0, footerAt);
    const re = /(\d{1,2})\.\s+([^]*?)(?=\s+\d{1,2}\.\s|\s*$)/g;
    let m;
    while ((m = re.exec(list))) {
      const num = Number(m[1]);
      if (num < 1 || num > 60) continue;
      const name = m[2].replace(/\s+/g, ' ').trim();
      if (name && name.length < 160) buildings.push({ num, name });
    }
  }
  const links = anchorsOf(main).filter((a) => /resource-manager/.test(a.href));
  const mapUrl = (links.find((a) => /map/i.test(a.label)) || links[0] || {}).href || '';
  const locatorUrl = (links.find((a) => /locator/i.test(a.label)) || {}).href || '';
  return { buildings, mapUrl, locatorUrl, securityPhone: phoneAfter(text, /Campus Security/) };
}

/**
 * Block-level chunks of a page, in document order: {tag, text}. Flattening a
 * page to one string loses the only boundaries these policies have — where one
 * paragraph ends and the next heading begins — so sections are read from the
 * blocks, not from a character window.
 */
function blocksOf(html) {
  const out = [];
  // Non-greedy and scanned forward, so a <p> nested inside an <li> is consumed
  // with its <li> rather than emitted twice.
  const re = /<(h[1-6]|p|li|blockquote|dd|dt)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = textOf(m[2]);
    if (!text) continue;
    // A block that is nothing but a link is a call to action ("Submit a tip"),
    // not more of the policy above it.
    const linkOnly = !textOf(m[2].replace(/<a\b[\s\S]*?<\/a>/gi, ' '));
    out.push({ tag: m[1].toLowerCase(), text, linkOnly });
  }
  return out;
}

// The labels the school gives the policy sections on the Safety & Security
// page, anchored to the start of a block. A section runs until the next one
// starts, so every label doubles as every other section's terminator.
const SAFETY_LABELS = {
  hours: /^School Hours\b:?/i,
  closedCampus: /^Closed Campus\b/i,
  visitorPolicy: /^Visitor Policy\b/i,
  security: /^Campus Security\b/i,
  emergency: /^Emergency\b/i,
  tipLine: /^(?:Anonymous Tip|Tip Line)\b/i,
  contact: /^Contact campus security/i,
  // The school runs these as their own paragraphs with no heading of any kind,
  // straight after the visitor policy. Without them here the Visitors card
  // keeps reading and swallows the food-delivery rules and the 9-1-1 line.
  foodDelivery: /^Food Delivery\b/i,
  callEmergency: /^In the event of\b/i,
  lostAndFound: /^Lost (?:&|and) Found\b/i,
};

/**
 * The same label, matchable mid-string. Case-sensitive on purpose: in running
 * prose the school writes "a closed campus", and only the section heading is
 * "Closed Campus" — matching loosely would end the section on its own sentence.
 */
const unanchored = (re) => new RegExp(re.source.replace(/^\^/, ''));

/**
 * The full text of one labelled section: the block carrying the label plus the
 * blocks that follow it, stopping at the next heading or the next known label.
 * The school rewrites these policies in place and they run to whatever length
 * they run to, so nothing here is bounded by a character count — a count is
 * what left the visitor policy ending mid-sentence on "In the interest".
 */
function safetySection(blocks, text, key) {
  const labelRe = SAFETY_LABELS[key];
  const others = Object.entries(SAFETY_LABELS).filter(([k]) => k !== key).map(([, re]) => re);
  const start = blocks.findIndex((b) => labelRe.test(b.text));
  let body;
  if (start >= 0) {
    const parts = [blocks[start].text];
    for (let i = start + 1; i < blocks.length; i++) {
      const b = blocks[i];
      // A heading always ends the section; so does a sibling section's label,
      // whether or not the CMS marked it up as a heading.
      if (/^h[1-6]$/.test(b.tag) || b.linkOnly) break;
      if (others.some((re) => re.test(b.text))) break;
      parts.push(b.text);
    }
    body = parts.join(' ');
  } else {
    // The CMS put the whole page in one block (or renamed the wrappers): fall
    // back to the flattened text, still cut at the next section rather than at
    // a character count.
    const from = text.search(unanchored(labelRe));
    if (from < 0) return '';
    body = text.slice(from);
    for (const re of others) {
      const next = body.slice(1).search(unanchored(re));
      if (next > 0) body = body.slice(0, next + 1);
    }
  }
  // The card already carries the section's title, so drop the label the page
  // repeats at the head of the prose ("Visitor Policy All visitors must…").
  return body
    .replace(labelRe, '')
    .replace(/^[\s:—–-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safety & Security — the real policies students/parents need at hand: campus
 * security phone, school hours, visitor policy, and the anonymous P3 tip line.
 */
function parseSafety(html) {
  const main = pageMain(html);
  const text = textOf(main);
  const blocks = blocksOf(main);
  const tip = (main.match(/href="(https?:\/\/(?:www\.)?p3campus\.com[^"]*)"/i) || [])[1] || '';
  return {
    securityPhone: phoneAfter(text, /security at/) || phoneAfter(text, /Campus Security/) || '',
    hours: safetySection(blocks, text, 'hours'),
    closedCampus: safetySection(blocks, text, 'closedCampus'),
    visitorPolicy: safetySection(blocks, text, 'visitorPolicy'),
    tipLineUrl: tip.replace(/&amp;/g, '&'),
  };
}

// ---- Portal auth (staff passwords) -------------------------------------------
//
// Minimal password accounts for the Admin/Teacher portals. Identities come from
// the scraped directory (email is the account key); passwords are scrypt-hashed
// in a SQLite database next to this server (node:sqlite — still no npm deps).
// "Create password" issues a one-time token and emails a setup link when SMTP
// is configured (SMTP_HOST/PORT/USER/PASS/FROM env vars); without SMTP the link
// is returned to the client, which shows it — the demo-mode fallback so the
// flow works end to end before email is wired up.

const AUTH_DB_FILE = new URL('./.data/auth.db', import.meta.url);
// Pre-SQLite builds stored the same records in auth.json; imported once below.
const LEGACY_AUTH_FILE = new URL('./.data/auth.json', import.meta.url);
const TOKEN_TTL_MS = 60 * 60 * 1000; // setup links live 1 hour
/**
 * Staff sessions are SLIDING, not fixed: every authenticated request pushes the
 * expiry back out to now + this (see touchSession in sessionEmail). A staff
 * member who keeps using the app is therefore never signed out by the clock —
 * the window only starts counting once they stop opening it altogether. The
 * fixed 30-day window this replaced expired mid-term on people who used the app
 * daily, which read as "the app logged me out at random".
 */
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days of INACTIVITY
/**
 * Don't rewrite the row on every single request — only once the session has
 * burned through a day of its window. Renewal is about surviving long gaps, not
 * about second-level precision.
 */
const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The session ALSO rides in an HttpOnly cookie, and that is what actually keeps
 * staff signed in on an iPhone.
 *
 * The app is installed as a home-screen PWA (public/manifest.webmanifest,
 * display: standalone), so it lives under WebKit's storage rules. WebKit caps
 * *script-writable* storage — localStorage, IndexedDB, document.cookie — and
 * clears it on its own schedule. The staff token and the saved profile both
 * lived in localStorage, so when WebKit swept it the device came back with no
 * sign-in at all, which is the "it logs me out after about a day" report.
 *
 * A cookie set by the SERVER with HttpOnly is explicitly exempt from that cap.
 * So it is the durable copy: when localStorage is gone, the cookie still proves
 * who this is, and the app restores the sign-in from it instead of showing a
 * sign-in form.
 *
 * SameSite=Lax means a cross-site request can't carry it, and only
 * /api/auth/session (a read, over POST, which Lax excludes from cross-site
 * sends) will honour it — every state-changing route still demands the Bearer
 * header. So this adds no CSRF surface.
 */
const SESSION_COOKIE = 'smchs_staff';

/**
 * The auth store. SQLite gives us what the JSON file made us hand-roll:
 * parameterized point lookups (no prototype-pollution lookup class), atomic
 * row-level writes (no load-mutate-save snapshot races around awaits), and
 * crash safety via its journal. A corrupt database still fails loudly on open
 * rather than reading as "no accounts". The process is single-threaded and
 * every statement here is synchronous, so statements never interleave between
 * requests; BEGIN IMMEDIATE below is purely crash-atomicity.
 */
let authDbHandle;
let authQ; // prepared statements

function authDb() {
  if (authDbHandle) return authDbHandle;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const path = fileURLToPath(AUTH_DB_FILE);
  // Built locally and published to authDbHandle only after EVERYTHING below
  // succeeded. The legacy migration throws on a corrupt auth.json so the
  // operator can restore it — caching the handle before that point would make
  // every later call skip the migration and hit undefined prepared statements,
  // turning a recoverable file problem into a broken-until-restart process.
  const db = new DatabaseSync(path);
  // 0600 like every file under .data/: the db holds password hashes and token
  // digests. SQLite's journal files inherit the database file's permissions.
  try { fs.chmodSync(path, 0o600); } catch {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        salt  TEXT NOT NULL,
        hash  TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS setup_tokens (
        token_hash TEXT PRIMARY KEY,
        email      TEXT NOT NULL,
        exp        INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        email      TEXT NOT NULL,
        exp        INTEGER NOT NULL
      ) STRICT;
      -- Display identity, captured at login. A session restored from the cookie
      -- has to name the person on screen, and resolving that from the scraped
      -- roster at restore time makes recovery depend on smhs.org being up — so
      -- it gets resolved once, while the roster is warm, and stored here.
      -- ALTERs run unconditionally: they throw on an already-migrated database,
      -- which is why each is swallowed individually below.
      CREATE INDEX IF NOT EXISTS idx_setup_tokens_email ON setup_tokens(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
      -- Admin access granted BY HAND from the app's Admins page, on top of the
      -- directory-derived eligibility (ADMIN_DEPARTMENTS / ADMIN_TITLES). Same
      -- account and password — a row here only widens which portal lets it in.
      CREATE TABLE IF NOT EXISTS admin_grants (
        email      TEXT PRIMARY KEY,
        granted_by TEXT NOT NULL,
        at         INTEGER NOT NULL
      ) STRICT;
    `);
    // Additive columns on an existing sessions table. SQLite has no
    // ADD COLUMN IF NOT EXISTS, so a re-run throws "duplicate column name" —
    // expected, and the only error this may swallow.
    for (const col of ['name TEXT', 'title TEXT', 'portal TEXT']) {
      try {
        db.exec(`ALTER TABLE sessions ADD COLUMN ${col}`);
      } catch (err) {
        if (!/duplicate column/i.test(String(err))) throw err;
      }
    }
    cleanupMigratedAuthJson(db);
    migrateLegacyAuthJson(db);
    authQ = {
      getUser: db.prepare('SELECT email, salt, hash FROM users WHERE email = ?'),
      upsertUser: db.prepare(
        'INSERT INTO users (email, salt, hash) VALUES (?, ?, ?) ' +
          'ON CONFLICT(email) DO UPDATE SET salt = excluded.salt, hash = excluded.hash',
      ),
      getSession: db.prepare(
        'SELECT email, exp, name, title, portal FROM sessions WHERE token_hash = ? AND exp > ?',
      ),
      // Sliding expiry: only ever pushes `exp` FORWARD, so a stale request that
      // raced a newer one can't shorten a session.
      touchSession: db.prepare(
        'UPDATE sessions SET exp = ? WHERE token_hash = ? AND exp < ?',
      ),
      insertSession: db.prepare(
        'INSERT INTO sessions (token_hash, email, exp, name, title, portal) VALUES (?, ?, ?, ?, ?, ?)',
      ),
      deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
      deleteSessionsForEmail: db.prepare('DELETE FROM sessions WHERE email = ?'),
      pruneSessions: db.prepare('DELETE FROM sessions WHERE exp <= ?'),
      getSetupToken: db.prepare(
        'SELECT email, exp FROM setup_tokens WHERE token_hash = ? AND exp > ?',
      ),
      insertSetupToken: db.prepare(
        'INSERT INTO setup_tokens (token_hash, email, exp) VALUES (?, ?, ?)',
      ),
      // A new link supersedes the account's older ones; expired rows ride along.
      pruneSetupTokens: db.prepare(
        'DELETE FROM setup_tokens WHERE email = ? OR exp <= ?',
      ),
      claimSetupToken: db.prepare(
        'DELETE FROM setup_tokens WHERE token_hash = ? AND exp > ?',
      ),
      getGrant: db.prepare('SELECT email FROM admin_grants WHERE email = ?'),
      listGrants: db.prepare('SELECT email FROM admin_grants ORDER BY at'),
      insertGrant: db.prepare(
        'INSERT INTO admin_grants (email, granted_by, at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(email) DO NOTHING',
      ),
      deleteGrant: db.prepare('DELETE FROM admin_grants WHERE email = ?'),
    };
  } catch (err) {
    // Leave no half-open handle behind: the next call re-runs the whole init.
    try { db.close(); } catch {}
    throw err;
  }
  authDbHandle = db;
  return authDbHandle;
}

/**
 * The rollback artifact migrateLegacyAuthJson leaves behind holds every staff
 * password hash in a plain file, so it must not outlive its purpose. It stays
 * for the boot that wrote it and is removed on the next one — but only once
 * the database it fed demonstrably took over (has users). Runs BEFORE the
 * migration on purpose: the artifact a fresh migration writes this boot gets
 * its full grace period.
 */
function cleanupMigratedAuthJson(db) {
  const migrated = new URL('./.data/auth.json.migrated', import.meta.url);
  if (!fs.existsSync(migrated)) return;
  if (!db.prepare('SELECT COUNT(*) AS n FROM users').get()?.n) return; // db empty: still the only copy
  // Best-effort: this runs inside authDb()'s init, so an unguarded throw here
  // would take every sign-in down over a housekeeping step. rmSync throws on a
  // file that vanished between the existsSync above and this line, and on a
  // read-only or wrong-permission .data/ — none of which is a reason to fail
  // auth. Log it and let the next boot try again.
  try {
    fs.rmSync(migrated);
    console.log('[auth] removed auth.json.migrated — the hashes live in auth.db now');
  } catch (err) {
    console.error('[auth] could not remove auth.json.migrated:', err.message);
  }
}

/**
 * One-time import of the pre-SQLite auth.json. INSERT OR IGNORE keeps this
 * idempotent (existing rows win) in case the rename below ever failed halfway.
 * The legacy file is kept, renamed, as a rollback artifact until the next
 * boot, when cleanupMigratedAuthJson above retires it — password hashes don't
 * belong in a plain file any longer than the rollback window needs. A corrupt
 * legacy file throws: nuking every staff password is never the fix, an
 * operator restores the backup.
 */
function migrateLegacyAuthJson(db) {
  let raw;
  try {
    raw = fs.readFileSync(LEGACY_AUTH_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  const legacy = JSON.parse(raw);
  const users = legacy?.users && typeof legacy.users === 'object' ? legacy.users : {};
  const tokens = legacy?.tokens && typeof legacy.tokens === 'object' ? legacy.tokens : {};
  const sessions = legacy?.sessions && typeof legacy.sessions === 'object' ? legacy.sessions : {};
  db.exec('BEGIN IMMEDIATE');
  try {
    const insUser = db.prepare('INSERT OR IGNORE INTO users (email, salt, hash) VALUES (?, ?, ?)');
    for (const [email, u] of Object.entries(users)) {
      if (typeof u?.salt === 'string' && typeof u?.hash === 'string') insUser.run(email, u.salt, u.hash);
    }
    const insToken = db.prepare('INSERT OR IGNORE INTO setup_tokens (token_hash, email, exp) VALUES (?, ?, ?)');
    for (const [key, t] of Object.entries(tokens)) {
      // Only sha256-hashed keys (64 hex chars) with complete records survive the
      // move — same fields the old lookup validated on every use.
      if (key.length === 64 && typeof t?.email === 'string' && t.email && typeof t?.exp === 'number') {
        insToken.run(key, t.email, t.exp);
      }
    }
    const insSession = db.prepare('INSERT OR IGNORE INTO sessions (token_hash, email, exp) VALUES (?, ?, ?)');
    for (const [key, s] of Object.entries(sessions)) {
      if (key.length === 64 && typeof s?.email === 'string' && s.email && typeof s?.exp === 'number') {
        insSession.run(key, s.email, s.exp);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  fs.renameSync(LEGACY_AUTH_FILE, new URL('./.data/auth.json.migrated', import.meta.url));
  console.log('[auth] migrated auth.json into auth.db (legacy file kept as auth.json.migrated)');
}

/**
 * scrypt on the thread pool, never on the event loop. scryptSync costs ~34ms,
 * and this server is single-threaded: doing it inline meant every login attempt
 * froze the app for all 6000 users, which also made repeated guesses a cheap
 * denial-of-service. Async keeps request handling responsive under load.
 */
function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = (await scrypt(password, salt)).toString('hex');
  return { salt, hash };
}

async function verifyPassword(password, user) {
  if (!user?.salt || typeof user.hash !== 'string') return false;
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  // timingSafeEqual throws on length mismatch (corrupt/legacy record), so gate
  // it — but still compare the equal-length case in constant time.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- Sessions ---------------------------------------------------------------
// Only the SHA-256 of a session token is persisted, so a leaked auth.db can't
// be replayed as a live staff session. Tokens are high-entropy random, so a
// plain digest (no salt/stretching) is the right primitive here.

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Bearer token → staff email, or '' when absent/unknown/expired.
 *
 * Using a session also RENEWS it (sliding expiry), so staff who keep opening
 * the app never hit the clock. The write is skipped until the session is a day
 * into its window so ordinary polling doesn't hammer the database.
 */
function sessionEmail(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!m) return '';
  return sessionEmailForToken(m[1]);
}

/**
 * The live session row for a token, or null. Renews on the way through, so
 * every use of a session pushes its expiry out.
 */
function sessionRecord(rawToken) {
  if (!rawToken) return null;
  authDb();
  const now = Date.now();
  const tokenHash = hashToken(rawToken);
  const session = authQ.getSession.get(tokenHash, now);
  if (!session?.email) return null;
  const renewed = now + SESSION_TTL_MS;
  if (session.exp < renewed - SESSION_RENEW_AFTER_MS) {
    authQ.touchSession.run(renewed, tokenHash, renewed);
  }
  return session;
}

/** The same lookup + renewal for a token that didn't arrive in a header. */
function sessionEmailForToken(rawToken) {
  return sessionRecord(rawToken)?.email || '';
}

// ⚠ TEMPORARY TEST ACCOUNTS — REMOVE BEFORE LAUNCH: emails allowed to create
// portal passwords without being in the scraped staff directory. Pairs with the
// client-side test accounts in src/components/PortalGate.tsx.
// Off unless ALLOW_TEST_ACCOUNTS is set, so a production boot has no allowlist.
const TEST_ACCOUNT_EMAILS = new Set(
  process.env.ALLOW_TEST_ACCOUNTS ? ['marcus.chien@crossgen-ai.com'] : [],
);

/** The scraped roster must contain the email — portals are for real staff only. */
async function staffEmailExists(email) {
  if (TEST_ACCOUNT_EMAILS.has(email)) return true; // ⚠ TEMPORARY — remove before launch
  const { staff } = await cached('staff', scrapeStaffAndSave, STAFF_TTL_MS);
  return staff.some((s) => s.email === email);
}

/**
 * Departments whose members administer the app. This MUST stay in step with
 * ADMIN_DEPARTMENTS in src/components/PortalGate.tsx, which decides who the
 * Admin portal lets in — the client already enforced this, the server did not,
 * so any teacher's session could rewrite school-wide content and push to every
 * device. Deriving it from the live directory means staff changes need no
 * redeploy and no hand-maintained list to drift.
 */
const ADMIN_DEPARTMENTS = [
  "Dean's Office",
  'Educational Technology',
  "President's Office",
  "Principal's Office",
];

/**
 * Directory TITLES that grant admin access on their own, for school leaders
 * whose directory department isn't one of the offices above (the Rector).
 * Exact title only — "Rector" qualifies, "Assistant to the Rector" does not.
 * MUST stay in step with ADMIN_TITLES in src/components/PortalGate.tsx.
 */
const ADMIN_TITLES = ['Rector'];

/** Exact-title match, forgiving only whitespace and case. */
function hasAdminTitle(person) {
  const title = String(person?.title ?? '')
    .trim()
    .toLowerCase();
  return ADMIN_TITLES.some((t) => t.toLowerCase() === title);
}

/** May this staff member write shared app data? */
async function isAdminEmail(email) {
  // ADMIN_EMAILS, when set, is the explicit override (tighter or broader) —
  // it replaces BOTH the directory-derived eligibility and the hand-granted
  // list, so a deployment that pins admins by env stays pinned.
  if (ADMIN_EMAILS.size) return ADMIN_EMAILS.has(email);
  if (TEST_ACCOUNT_EMAILS.has(email)) return true; // ⚠ TEMPORARY — remove before launch
  // Hand-granted from the app's Admins page. Checked before the roster: a
  // grant must keep working even while the directory scrape is down.
  authDb();
  if (authQ.getGrant.get(email)) return true;
  const { staff } = await cached('staff', scrapeStaffAndSave, STAFF_TTL_MS);
  const person = staff.find((s) => s.email === email);
  if (!person) return false;
  return Boolean(person.departments?.some((d) => ADMIN_DEPARTMENTS.includes(d))) || hasAdminTitle(person);
}

/** Read and JSON-parse a request body. */
function readBody(req, max = 10_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > max) req.destroy(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        // Tagged so the request handler can answer 400 instead of letting this
        // reach the outer catch, which reports every throw as a 502 "upstream
        // request failed" — a client-side mistake dressed up as a server fault.
        const err = new Error('invalid JSON');
        err.badRequest = true;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ---- Auth rate limit --------------------------------------------------------
// Fixed window per client IP, in memory only. Guards /api/auth/* against
// password guessing and setup-link spraying. The read-only feed routes are NOT
// limited — the whole fleet polls those by design.
//
// One process, one map: with ~6000 users behind a handful of school NATs this
// is deliberately generous, and it only ever sees auth traffic (a few requests
// per sign-in), never the polling paths.

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10; // attempts per window per IP
const rateBuckets = new Map(); // ip -> { count, reset }

function clientIp(req) {
  // X-Forwarded-For is caller-supplied unless a proxy we control appends it, so
  // trusting it unconditionally let anyone mint a fresh rate-limit bucket per
  // request — i.e. no rate limit at all. Set TRUST_PROXY only when a reverse
  // proxy in front of this server rewrites the header; then the LAST hop is the
  // one it added (earlier hops are still attacker-supplied).
  if (process.env.TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) {
      const hops = xff.split(',');
      return hops[hops.length - 1].trim();
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

/** @returns {number} 0 when allowed, else Retry-After seconds. */
function rateLimit(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.reset <= now) {
    rateBuckets.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return 0;
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX) return Math.max(1, Math.ceil((bucket.reset - now) / 1000));
  return 0;
}

// Sweep expired buckets so a long uptime can't grow the map without bound.
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of rateBuckets) if (b.reset <= now) rateBuckets.delete(ip);
  for (const [ip, b] of ticketBuckets) if (b.reset <= now) ticketBuckets.delete(ip);
}, RATE_WINDOW_MS).unref();

// Support-ticket creation gets its own (deliberately generous) per-IP window:
// a whole school behind one NAT filing real tickets must never be blocked, but
// a scripted flood should be. The per-device daily cap in metrics.mjs is the
// finer-grained guard.
const TICKET_WINDOW_MS = 60 * 60 * 1000;
const TICKET_MAX_PER_WINDOW = 30;
const ticketBuckets = new Map(); // ip -> { count, reset }

/** @returns {number} 0 when allowed, else Retry-After seconds. */
function ticketRateLimit(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = ticketBuckets.get(ip);
  if (!bucket || bucket.reset <= now) {
    ticketBuckets.set(ip, { count: 1, reset: now + TICKET_WINDOW_MS });
    return 0;
  }
  bucket.count += 1;
  if (bucket.count > TICKET_MAX_PER_WINDOW) return Math.max(1, Math.ceil((bucket.reset - now) / 1000));
  return 0;
}

/** A token from a request body, with or without the "Bearer " prefix. */
function bearer(value) {
  const raw = String(value || '');
  const m = /^Bearer\s+(\S+)$/i.exec(raw);
  return m ? m[1] : raw;
}

/** The staff session token carried in the durable cookie, if any. */
function cookieToken(req) {
  const header = req.headers.cookie;
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}

/**
 * Secure is required for a cookie to be worth anything, but it also stops the
 * browser storing it over plain http — which is exactly how `next dev` against
 * the proxy on localhost runs. Set it whenever the request actually arrived
 * over TLS (directly or through a reverse proxy that says so).
 */
function isSecureRequest(req) {
  if (req.socket?.encrypted) return true;
  const proto = req.headers['x-forwarded-proto'];
  return typeof proto === 'string' && proto.split(',')[0].trim() === 'https';
}

function sessionCookie(req, token) {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isSecureRequest(req)) attrs.push('Secure');
  return attrs.join('; ');
}

function clearedSessionCookie(req) {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecureRequest(req)) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * Look up how a staff member should be shown: their directory name, title, and
 * which portal they belong in. Resolved once, at login, and stored on the
 * session row — see resolveIdentity's callers.
 */
async function resolveIdentity(email) {
  let person = null;
  try {
    const { staff } = await cached('staff', scrapeStaffAndSave, STAFF_TTL_MS);
    person = staff.find((s) => s.email === email) || null;
  } catch {
    /* roster unavailable — the email alone still identifies them */
  }
  return {
    email,
    // Falling back to the email keeps a sign-in usable when the roster has no
    // entry (a test account, or a scrape that hasn't landed yet).
    name: person?.name || email,
    title: person?.title || '',
    portal: (await isAdminEmail(email)) ? 'admin' : 'teacher',
  };
}

/**
 * Everything the app needs to rebuild a staff sign-in from nothing but a live
 * session. Served from the session row, so restoring a sign-in never depends on
 * smhs.org being reachable; only a session predating those columns falls back
 * to a live lookup.
 */
async function sessionIdentity(session) {
  if (session.name && session.portal) {
    return {
      email: session.email,
      name: session.name,
      title: session.title || '',
      portal: session.portal,
    };
  }
  return resolveIdentity(session.email);
}

async function handleAuth(pathname, body, req) {
  const email = String(body.email || '').trim().toLowerCase();
  authDb();

  if (pathname === '/api/auth/status') {
    if (!email) return { status: 400, body: { error: 'email required' } };
    // Never reveal WHICH staff already have a password: that narrows a guessing
    // list against a public roster. The client's flow works either way — it
    // offers "create password" and the server rejects a bad token.
    return { status: 200, body: { exists: true } };
  }

  if (pathname === '/api/auth/login') {
    const user = authQ.getUser.get(email);
    const ok = Boolean(user && (await verifyPassword(String(body.password || ''), user)));
    if (!ok) return { status: 401, body: { error: 'Incorrect email or password' } };
    // Issue a session token for staff-only APIs (app-data writes). Sessions
    // outlive the process (stored beside the accounts) and expire in 30 days.
    // Row-level inserts can't roll back writes that landed during the hashing
    // await, so no snapshot re-read dance is needed here anymore.
    const token = crypto.randomBytes(24).toString('hex');
    authQ.pruneSessions.run(Date.now());
    // Resolve the display identity NOW, while the roster is warm, and store it
    // with the session: restoring this sign-in months later must not depend on
    // smhs.org answering.
    const who = await resolveIdentity(email);
    authQ.insertSession.run(
      hashToken(token),
      email,
      Date.now() + SESSION_TTL_MS,
      who.name,
      who.title,
      who.portal,
    );
    // The same session in both places: the token for Bearer writes, the cookie
    // as the copy that outlives a localStorage sweep (see SESSION_COOKIE).
    return {
      status: 200,
      body: { ok: true, token },
      headers: { 'Set-Cookie': sessionCookie(req, token) },
    };
  }

  // Is this token still a live session? Answering also RENEWS it (sessionEmail
  // slides the expiry), which is the whole point: the app calls this on every
  // launch and every return to the foreground, so an in-use session keeps
  // pushing its own expiry out and never lapses. A 401 here is the ONLY signal
  // the client treats as "you really are signed out".
  if (pathname === '/api/auth/session') {
    const raw = bearer(body.token);
    const session = sessionRecord(raw);
    if (session) {
      // Known-good token: renew the cookie alongside it so the durable copy
      // never expires behind the session it mirrors.
      return {
        status: 200,
        body: { ok: true, identity: await sessionIdentity(session) },
        headers: { 'Set-Cookie': sessionCookie(req, raw) },
      };
    }

    // No usable token — but the cookie may have outlived it. This is the
    // recovery path for a device whose localStorage WebKit swept: the cookie
    // still proves the sign-in, so hand back a fresh token and who they are,
    // and the app restores itself instead of showing a sign-in form.
    const cookieRaw = cookieToken(req);
    const cookieSession = cookieRaw ? sessionRecord(cookieRaw) : null;
    if (!cookieSession) return { status: 401, body: { error: 'Session expired' } };
    const identity = await sessionIdentity(cookieSession);
    // Rotate rather than echoing the cookie's own token back into JS: the
    // cookie is HttpOnly, and handing its value to script would undo that.
    const fresh = crypto.randomBytes(24).toString('hex');
    authQ.insertSession.run(
      hashToken(fresh),
      cookieSession.email,
      Date.now() + SESSION_TTL_MS,
      identity.name,
      identity.title,
      identity.portal,
    );
    authQ.deleteSession.run(hashToken(cookieRaw));
    return {
      status: 200,
      body: { ok: true, token: fresh, restored: true, identity },
      headers: { 'Set-Cookie': sessionCookie(req, fresh) },
    };
  }

  // Signing out must actually kill the session server-side: without this a
  // leaked token stayed valid for its full lifetime with no lever to pull.
  if (pathname === '/api/auth/logout') {
    const raw = bearer(body.token);
    if (raw) authQ.deleteSession.run(hashToken(raw));
    // The cookie is the durable copy, so signing out has to kill it too —
    // otherwise the next launch would helpfully restore the session the user
    // just ended. Clear the cookie's own session as well: after a localStorage
    // sweep the client has no token to send, and only the cookie identifies
    // the session that needs ending.
    const cookieRaw = cookieToken(req);
    if (cookieRaw && cookieRaw !== raw) authQ.deleteSession.run(hashToken(cookieRaw));
    return {
      status: 200,
      body: { ok: true },
      headers: { 'Set-Cookie': clearedSessionCookie(req) },
    };
  }

  if (pathname === '/api/auth/request-setup') {
    if (!email || !(await staffEmailExists(email))) {
      return { status: 404, body: { error: 'Not found in the staff directory' } };
    }
    const token = crypto.randomBytes(24).toString('hex');
    // Store only the SHA-256 of the setup token, like sessions (see hashToken):
    // the raw token lives only in the emailed link, so a leaked auth.db can't
    // be replayed to set a password. A new link supersedes the account's older
    // ones (and sweeps expired rows while we're here).
    authQ.pruneSetupTokens.run(email, Date.now());
    authQ.insertSetupToken.run(hashToken(token), email, Date.now() + TOKEN_TTL_MS);
    // The link origin is server-side ONLY. Trusting the client's `origin` let
    // an attacker mint a real token for any staff email and have the school's
    // own SMTP identity mail it to a look-alike domain they control.
    const origin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
    const setupUrl = `${origin}/portal/set-password/?token=${token}`;
    try {
      await sendMail(
        email,
        'Set your SMCHS App password',
        `Hi,\n\nA password setup was requested for your SMCHS App staff account.\n` +
          `Open this link to create your password (valid for 1 hour):\n\n${setupUrl}\n\n` +
          `If you didn't request this, you can ignore this email.`,
      );
      return { status: 200, body: { ok: true, emailed: true } };
    } catch (err) {
      // Handing the link to whoever asked is account takeover: anyone could
      // request one for any staff member and read the token straight out of
      // the response. A send failure must NOT downgrade to that — and it can't
      // tell "SMTP unconfigured" from "SMTP had a blip", so neither may.
      // Only an explicitly non-production server returns the link.
      if (process.env.ALLOW_TEST_ACCOUNTS) {
        return { status: 200, body: { ok: true, emailed: false, setupUrl } };
      }
      console.error('[auth] setup email failed:', err.message);
      return {
        status: 500,
        body: { error: "Couldn't send the setup email. Contact the app administrator." },
      };
    }
  }

  if (pathname === '/api/auth/set-password') {
    const token = String(body.token || '');
    const password = String(body.password || '');
    const tokenKey = hashToken(token);
    // The SELECT itself enforces "live token" (exp > now); schema NOT NULLs
    // enforce a real email, so an incomplete record can't exist to match.
    const entry = authQ.getSetupToken.get(tokenKey, Date.now());
    if (!entry || !entry.email) {
      return { status: 400, body: { error: 'This setup link is invalid or has expired' } };
    }
    if (password.length < 6) {
      return { status: 400, body: { error: 'Password must be at least 6 characters' } };
    }
    const hashed = await hashPassword(password);
    // Atomically claim the token after the hashing await: the DELETE only
    // succeeds for a still-live row, so two set-password calls racing on the
    // same link can't both get through.
    const claimed = authQ.claimSetupToken.run(tokenKey, Date.now());
    if (claimed.changes !== 1) {
      return { status: 400, body: { error: 'This setup link is invalid or has expired' } };
    }
    authDb().exec('BEGIN IMMEDIATE');
    try {
      authQ.upsertUser.run(entry.email, hashed.salt, hashed.hash);
      // Setting a password invalidates that account's existing sessions: if the
      // reset was a takeover attempt, the attacker's session dies with it.
      authQ.deleteSessionsForEmail.run(entry.email);
      authDb().exec('COMMIT');
    } catch (err) {
      authDb().exec('ROLLBACK');
      throw err;
    }
    return { status: 200, body: { ok: true, email: entry.email } };
  }

  // ---- Hand-granted admin access (the app's Admins page) --------------------
  // Grants widen WHO the Admin portal admits; the account and password stay
  // exactly as they were. Both routes demand a live ADMIN session: only an
  // existing administrator can mint (or remove) another one.
  if (pathname === '/api/auth/admins/grant' || pathname === '/api/auth/admins/revoke') {
    const granter = sessionEmail(req);
    if (!granter) return { status: 401, body: { error: 'staff sign-in required' } };
    if (!(await isAdminEmail(granter))) {
      return { status: 403, body: { error: 'admin access required' } };
    }
    if (!email) return { status: 400, body: { error: 'email required' } };

    if (pathname === '/api/auth/admins/grant') {
      // With ADMIN_EMAILS set, isAdminEmail is gated entirely by that env list —
      // a grant would store a row, report success, and then have no effect. Say
      // so instead of minting a promise the deployment can't keep. (Revoke stays
      // allowed: deleting an inert row is harmless cleanup.)
      if (ADMIN_EMAILS.size) {
        return {
          status: 409,
          body: { error: 'Admins are fixed by the server (ADMIN_EMAILS); grants here would have no effect.' },
        };
      }
      // Grants are for real staff only, same rule as password setup.
      if (!(await staffEmailExists(email))) {
        return { status: 404, body: { error: 'Not found in the staff directory' } };
      }
      if (await isAdminEmail(email)) {
        return { status: 409, body: { error: 'This person can already use the Admin portal' } };
      }
      authQ.insertGrant.run(email, granter, Date.now());
      auditGrant(granter, 'admin-grant', email, clientIp(req));
      return { status: 200, body: { ok: true } };
    }

    // Revoke removes only a hand-made grant — directory-derived access
    // (departments/titles) isn't stored here and can't be revoked from the app.
    const removed = authQ.deleteGrant.run(email);
    if (removed.changes !== 1) {
      return { status: 404, body: { error: 'No hand-granted access for that email' } };
    }
    // Their live sessions were minted as admin sessions; end them so the next
    // sign-in re-resolves to the teacher portal. Same account, same password.
    authQ.deleteSessionsForEmail.run(email);
    auditGrant(granter, 'admin-revoke', email, clientIp(req));
    return { status: 200, body: { ok: true } };
  }

  return { status: 404, body: { error: 'not found' } };
}

/** One audit line per grant change: who did it, from where, what, to whom. */
function auditGrant(granter, action, target, ip) {
  try {
    fs.appendFileSync(
      AUDIT_FILE,
      `${new Date().toISOString()}\t${granter}\t${ip ?? '-'}\t${action}:${target}\n`,
      { mode: 0o600 },
    );
  } catch (err) {
    console.error('[audit]', err);
  }
}

// ---- server -----------------------------------------------------------------

// ---- App data (server-owned content) ------------------------------------------
//
// The editable content the app serves: campus map pins + outlines. The seeds in
// the app bundle are only an offline fallback; this file is the source of truth
// shared by every device. GET is public and ETag'd, so thousands of devices can
// poll cheaply — a 304 means "you already have it", no download. PUT replaces
// keys and requires a signed-in staff session.
// ponytail: one JSON file, last-write-wins; per-key compare-and-swap if two
// admins editing at once ever actually becomes a thing.

const DATA_FILE = new URL('./.data/data.json', import.meta.url);
// List keys must be arrays; singleton keys are small objects (dining overrides)
// or null-able (alert).
const DATA_LIST_KEYS = ['pois', 'outlines', 'announcements', 'diningItems', 'prayers', 'events', 'contactGroups', 'notices'];
const DATA_SINGLETON_KEYS = ['dining', 'alert', 'scheduleDays', 'eventEdits', 'school'];

// The whole fleet polls /api/data every ~30s, so the parsed file + its ETag
// stay in memory; the disk is read once per boot and re-written on each save.
let dataCache; // { data, etag } | null | undefined (undefined = not loaded yet)

function loadData() {
  if (dataCache !== undefined) return dataCache?.data ?? null;
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (err) {
    // Genuinely no file yet = empty app data. Anything else (a read error, a
    // half-restored file) must not latch as "no data": that would disable the
    // If-Match guard below and let the next write persist an empty document.
    if (err.code === 'ENOENT') {
      dataCache = null;
      return null;
    }
    throw err;
  }
  // A corrupt file is a crash artifact. Throwing keeps the bytes on disk for an
  // operator to restore from .data/backups instead of silently starting over.
  const data = JSON.parse(raw);
  dataCache = { data, etag: dataEtag(data) };
  return data;
}

function loadDataEtag() {
  loadData();
  return dataCache?.etag ?? null;
}

const BACKUP_DIR = new URL('./backups/', DATA_DIR);
const MAX_BACKUPS = 50;

/**
 * Keep the previous data.json before overwriting it. Every school-content edit
 * replaces the whole document, so one bad save (an admin mistake, a client bug)
 * is otherwise unrecoverable — we learned that the hard way. ~50 copies of a
 * ~20KB file costs a megabyte.
 */
function backupData() {
  let current;
  try {
    current = fs.readFileSync(DATA_FILE);
  } catch {
    return; // nothing to back up yet
  }
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(new URL(`data-${stamp}.json`, BACKUP_DIR), current, { mode: 0o600 });
    const old = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('data-') && f.endsWith('.json'))
      .sort();
    for (const f of old.slice(0, Math.max(0, old.length - MAX_BACKUPS))) {
      fs.unlinkSync(new URL(f, BACKUP_DIR));
    }
  } catch (err) {
    // A failed backup must never block the save itself.
    console.error('[backup]', err);
  }
}

/**
 * Append-only record of who changed what. Backups let you recover the content;
 * this says which account made the change and which keys it touched — the
 * question you actually ask when shared data changes unexpectedly and several
 * admins have access.
 */
const AUDIT_FILE = new URL('./audit.log', DATA_DIR);

function auditWrite(email, prev, next, ip) {
  try {
    const keys = [...new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})])]
      .filter((k) => k !== 'updatedAt' && k !== 'updatedBy')
      .filter((k) => JSON.stringify(prev?.[k]) !== JSON.stringify(next?.[k]));
    if (keys.length === 0) return;
    // Counts make a destructive write obvious at a glance (7 periods -> 5).
    const sizes = keys
      .map((k) => {
        const v = next?.[k];
        const n = Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : null;
        const was = prev?.[k];
        const m = Array.isArray(was) ? was.length : was && typeof was === 'object' ? Object.keys(was).length : null;
        return n === null && m === null ? k : `${k}(${m ?? '-'}->${n ?? '-'})`;
      })
      .join(' ');
    fs.appendFileSync(
      AUDIT_FILE,
      `${new Date().toISOString()}\t${email}\t${ip ?? '-'}\t${sizes}\n`,
      { mode: 0o600 },
    );
  } catch (err) {
    console.error('[audit]', err);
  }
}

function saveData(data) {
  backupData();
  writeFileAtomic(DATA_FILE, JSON.stringify(data, null, 2));
  dataCache = { data, etag: dataEtag(data) };
}

function dataEtag(data) {
  // Sorted keys, so the hash is a property of the CONTENT. Plain stringify
  // follows insertion order, which differs between a live object and one
  // reloaded from disk — that flips the ETag across a restart for identical
  // data and 412s every admin mid-edit.
  const canonical = JSON.stringify(data, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
  return `"${crypto.createHash('sha1').update(canonical).digest('hex')}"`;
}

// Write limits. Every device downloads this file, so one bad admin write must
// not be able to balloon it: the 1MB body cap in readBody is the outer bound,
// these are the per-shape ones.
const MAX_LIST_LEN = 2000; // entries per list key
const MAX_STRING_LEN = 20_000; // characters, anywhere in the payload

/** Cheap recursive scan for an over-long string. */
function tooLongString(value, depth = 0) {
  if (typeof value === 'string') return value.length > MAX_STRING_LEN;
  // Past the depth cap, REJECT rather than wave through: returning false made
  // the cap an escape hatch — anything nested deeper skipped the length check.
  if (depth > 12) return true;
  if (value === null || typeof value !== 'object') return false;
  for (const v of Array.isArray(value) ? value : Object.values(value)) {
    if (tooLongString(v, depth + 1)) return true;
  }
  return false;
}

async function handleData(req) {
  if (req.method === 'GET') {
    const data = loadData();
    if (!data) return { status: 404, body: { error: 'no data yet' } };
    return { status: 200, body: data, etag: loadDataEtag() };
  }
  if (req.method === 'PUT') {
    const email = sessionEmail(req);
    if (!email) return { status: 401, body: { error: 'staff sign-in required' } };
    // Authentication is not authorization: every write here replaces school-wide
    // content and can fire a push to every device, so being signed-in staff is
    // not enough — the writer must be an actual app administrator.
    if (!(await isAdminEmail(email))) {
      return { status: 403, body: { error: 'admin access required' } };
    }
    const body = await readBody(req, 1_000_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 400, body: { error: 'body must be a JSON object' } };
    }
    if (tooLongString(body)) {
      return { status: 400, body: { error: `no string may exceed ${MAX_STRING_LEN} characters` } };
    }
    // Optimistic concurrency: a device may only replace the version it read
    // (If-Match carries that version's ETag). Without this, a phone waking up
    // with a weeks-old unsynced snapshot force-pushes it wholesale and erases
    // everything written since — which is exactly what happened once.
    //
    // Fail CLOSED: a missing If-Match is rejected rather than treated as
    // "overwrite whatever is there". An optional guard is not a guard, and the
    // ways to lose the ETag (cleared storage, a proxy weakening it) are the
    // same situations where the client's copy is most likely to be stale.
    // Only the very first write to an empty server is exempt.
    const ifMatch = req.headers['if-match'];
    const currentEtag = loadDataEtag();
    if (currentEtag) {
      if (!ifMatch) {
        return { status: 428, body: { error: 'If-Match required: refetch /api/data first' } };
      }
      // A proxy may weaken the validator to W/"…"; compare the entity part.
      const strip = (t) => String(t).replace(/^W\//, '').trim();
      if (strip(ifMatch) !== strip(currentEtag)) {
        return { status: 412, body: { error: 'data changed since this device last synced' } };
      }
    }
    const next = { ...(loadData() ?? {}) };
    // Captured before the merge below so writes can be diffed against what
    // every device had until this moment (schedule edits + new banners).
    const prevScheduleDays = next.scheduleDays;
    const prevNotices = next.notices;
    const prevAlert = next.alert;
    for (const key of DATA_LIST_KEYS) {
      if (body[key] !== undefined) {
        if (!Array.isArray(body[key])) return { status: 400, body: { error: `${key} must be an array` } };
        if (body[key].length > MAX_LIST_LEN) {
          return { status: 400, body: { error: `${key} may not exceed ${MAX_LIST_LEN} entries` } };
        }
        next[key] = body[key];
      }
    }
    // Singletons were previously accepted with NO validation at all: an array,
    // a number, or a scheduleDays map with 100k keys would persist and then be
    // served to every device on every poll.
    for (const key of DATA_SINGLETON_KEYS) {
      const v = body[key];
      if (v === undefined) continue;
      if (v !== null && (typeof v !== 'object' || Array.isArray(v))) {
        return { status: 400, body: { error: `${key} must be an object or null` } };
      }
      if (v !== null && Object.keys(v).length > MAX_LIST_LEN) {
        return { status: 400, body: { error: `${key} may not exceed ${MAX_LIST_LEN} entries` } };
      }
      next[key] = v;
    }
    next.updatedAt = new Date().toISOString();
    next.updatedBy = email;
    auditWrite(email, loadData(), next, clientIp(req));
    saveData(next);
    // The save is already committed. A throw in the notify hooks would unwind
    // to a 502, so the admin sees an error and never receives the new ETag —
    // leaving their client permanently conflicting against data that DID save.
    try {
      if (body.scheduleDays !== undefined) notifyScheduleChanges(prevScheduleDays, next.scheduleDays);
      if (body.notices !== undefined || body.alert !== undefined) {
        notifyNewBanners(
          { notices: prevNotices, alert: prevAlert },
          { notices: next.notices, alert: next.alert },
        ).catch((err) => console.error('[push]', err));
      }
    } catch (err) {
      console.error('[notify]', err);
    }
    return { status: 200, body: next, etag: dataEtag(next) };
  }
  return { status: 404, body: { error: 'not found' } };
}

// ---- Web Push (schedule-change notifications) ----------------------------------
//
// When an admin edits a day's bell schedule, every subscribed device gets a
// push notification. Standard Web Push: VAPID (RFC 8292) for server identity
// and RFC 8291 aes128gcm payload encryption, implemented on Node built-ins
// only like the rest of this server. Works for the installed PWA on Android
// and on iOS 16.4+ (Add to Home Screen). The VAPID keypair is generated on
// first boot and kept with the subscriptions in push.db under .data/.
//
// SQLite for the same reasons as auth: the store used to be one JSON blob
// (push.json) rewritten wholesale on every change, which meant a debounced
// save window that could drop subscriptions on a crash, a multi-megabyte
// synchronous write on the event loop from an unauthenticated endpoint, and a
// private signing key sitting in a plain file. Row-level writes remove all
// three, and parameterized point lookups make the prototype-pollution-proof
// wrapper the JSON version needed (bareMap) unnecessary.

const PUSH_DB_FILE = new URL('./.data/push.db', import.meta.url);
// Pre-SQLite builds stored the keypair and subscriptions here; imported once below.
const LEGACY_PUSH_FILE = new URL('./.data/push.json', import.meta.url);
// Contact for push services to reach the operator about misbehaving senders.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:app@smhs.org';
// One row per enabled device. ~6000 users x a couple of devices, with margin.
const MAX_PUSH_SUBS = 20000;

let pushDbHandle;
let pushQ; // prepared statements
let vapidKeys; // { publicJwk, privateJwk } — immutable once minted, cached after first read

function pushDb() {
  if (pushDbHandle) return pushDbHandle;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const path = fileURLToPath(PUSH_DB_FILE);
  // Built locally and published to pushDbHandle only after EVERYTHING below
  // succeeded. The legacy migration throws on a corrupt push.json so the
  // operator can restore it — caching the handle before that point would make
  // every later call skip the migration and hit undefined prepared statements,
  // turning a recoverable file problem into a broken-until-restart process.
  const db = new DatabaseSync(path);
  // 0600 like every file under .data/: the db holds the VAPID private key.
  try { fs.chmodSync(path, 0o600); } catch {}
  try {
    db.exec(`
      -- The server's one keypair. CHECK (id = 1) makes it a single-row table:
      -- a second keypair could only ever mean subscriptions signed two ways.
      CREATE TABLE IF NOT EXISTS vapid_keys (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        public_jwk  TEXT NOT NULL,
        private_jwk TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS push_subs (
        endpoint TEXT PRIMARY KEY,
        p256dh   TEXT NOT NULL,
        auth     TEXT NOT NULL,
        at       INTEGER NOT NULL
      ) STRICT;
    `);
    migrateLegacyPushJson(db);
    pushQ = {
      getKeys: db.prepare('SELECT public_jwk, private_jwk FROM vapid_keys WHERE id = 1'),
      insertKeys: db.prepare(
        'INSERT INTO vapid_keys (id, public_jwk, private_jwk) VALUES (1, ?, ?)',
      ),
      getSub: db.prepare('SELECT auth FROM push_subs WHERE endpoint = ?'),
      countSubs: db.prepare('SELECT COUNT(*) AS n FROM push_subs'),
      upsertSub: db.prepare(
        'INSERT INTO push_subs (endpoint, p256dh, auth, at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, at = excluded.at',
      ),
      deleteSub: db.prepare('DELETE FROM push_subs WHERE endpoint = ?'),
      allSubs: db.prepare('SELECT endpoint, p256dh, auth FROM push_subs'),
    };
  } catch (err) {
    // Leave no half-open handle behind: the next call re-runs the whole init.
    try { db.close(); } catch {}
    throw err;
  }
  pushDbHandle = db;
  return pushDbHandle;
}

/**
 * One-time import of the pre-SQLite push.json. INSERT OR IGNORE on both tables
 * keeps it idempotent; an existing database wins over the legacy file. A
 * corrupt legacy file throws rather than proceeding — minting a fresh keypair
 * over a readable-but-broken store would silently orphan every subscribed
 * device school-wide (see loadVapidKeys), so an operator restores the file.
 *
 * Unlike the auth migration, the legacy file is DELETED, not kept renamed: it
 * holds the VAPID private key, and leaving a second copy of a signing key in a
 * plain JSON file is the problem this migration exists to end. Deletion only
 * happens after the transaction commits and the key row reads back.
 */
function migrateLegacyPushJson(db) {
  let raw;
  try {
    raw = fs.readFileSync(LEGACY_PUSH_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  const legacy = JSON.parse(raw); // throws on corruption: keep the file for recovery
  db.exec('BEGIN IMMEDIATE');
  try {
    if (legacy?.publicJwk && legacy?.privateJwk) {
      db.prepare('INSERT OR IGNORE INTO vapid_keys (id, public_jwk, private_jwk) VALUES (1, ?, ?)').run(
        JSON.stringify(legacy.publicJwk),
        JSON.stringify(legacy.privateJwk),
      );
    }
    const ins = db.prepare(
      'INSERT OR IGNORE INTO push_subs (endpoint, p256dh, auth, at) VALUES (?, ?, ?, ?)',
    );
    const subs = legacy?.subs && typeof legacy.subs === 'object' ? legacy.subs : {};
    for (const [endpoint, s] of Object.entries(subs)) {
      if (typeof s?.p256dh === 'string' && typeof s?.auth === 'string') {
        ins.run(endpoint, s.p256dh, s.auth, Number(s?.at) || 0);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  // The file is the only other copy of the private key: prove the db has one
  // before removing it. (No key in either place is the same hard stop.)
  if (!db.prepare('SELECT id FROM vapid_keys WHERE id = 1').get()) {
    throw new Error('push.json migration wrote no VAPID keypair; keeping the legacy file');
  }
  fs.rmSync(LEGACY_PUSH_FILE);
  console.log('[push] migrated push.json into push.db (legacy file deleted: it held the private key)');
}

function loadVapidKeys() {
  if (vapidKeys) return vapidKeys;
  pushDb();
  const row = pushQ.getKeys.get();
  if (row) {
    vapidKeys = { publicJwk: JSON.parse(row.public_jwk), privateJwk: JSON.parse(row.private_jwk) };
    return vapidKeys;
  }
  // ONLY a genuinely empty store may mint a new keypair — a corrupt db or
  // legacy file has already thrown above. Regenerating over existing state
  // would silently invalidate every device's subscription school-wide, with
  // no way for them to notice and re-register.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  vapidKeys = {
    publicJwk: publicKey.export({ format: 'jwk' }),
    privateJwk: privateKey.export({ format: 'jwk' }),
  };
  pushQ.insertKeys.run(JSON.stringify(vapidKeys.publicJwk), JSON.stringify(vapidKeys.privateJwk));
  return vapidKeys;
}

/** The VAPID public key as the base64url uncompressed P-256 point subscribe() wants. */
function pushPublicKey() {
  const { publicJwk } = loadVapidKeys();
  return Buffer.concat([
    Buffer.from([4]),
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url'),
  ]).toString('base64url');
}

/** VAPID Authorization header for one push-service origin. */
function vapidAuth(endpoint) {
  const { privateJwk } = loadVapidKeys();
  const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64u({ typ: 'JWT', alg: 'ES256' })}.${b64u({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), {
    key: crypto.createPrivateKey({ key: privateJwk, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363', // JWS wants raw r||s, not DER
  });
  return `vapid t=${unsigned}.${sig.toString('base64url')}, k=${pushPublicKey()}`;
}

/** RFC 8291 payload encryption (aes128gcm) for one subscription. */
function encryptPush(sub, payload) {
  const uaPublic = Buffer.from(sub.p256dh, 'base64url'); // the device's P-256 point
  const authSecret = Buffer.from(sub.auth, 'base64url'); // the device's 16-byte secret
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ikm = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      ecdh.computeSecret(uaPublic),
      authSecret,
      Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]),
      32,
    ),
  );
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
  );
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), // 0x02 = final record
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  // aes128gcm header: salt | record size 4096 | key id length | our public key
  return Buffer.concat([salt, Buffer.from([0, 0, 16, 0, asPublic.length]), asPublic, ciphertext]);
}

/** POST one encrypted notification. Resolves the push service's status (0 = network error). */
function sendPush(endpoint, body, auth) {
  return new Promise((resolve) => {
    const req = https.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          TTL: '86400',
          Urgency: 'high',
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          'Content-Length': body.length,
          Authorization: auth,
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('error', () => resolve(0));
    req.setTimeout(15000, () => req.destroy());
    req.write(body);
    req.end();
  });
}

/** Send { title, body, url, tag } to every subscription; prune the dead ones. */
async function broadcastPush(note) {
  pushDb();
  // A snapshot, deliberately: the send loop awaits between batches, and rows
  // added or removed mid-broadcast belong to the next one.
  const subs = pushQ.allSubs.all();
  if (subs.length === 0) return;
  const payload = JSON.stringify(note);
  let sent = 0;
  let pruned = 0;
  // Everything that isn't a success or a prune is counted, so a fully failed
  // broadcast can't read like a quiet success in the logs.
  const failures = new Map();
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(
      subs.slice(i, i + 20).map(async (sub) => {
        try {
          let status = await sendPush(sub.endpoint, encryptPush(sub, payload), vapidAuth(sub.endpoint));
          // One retry for the transient classes (rate limit, service blip);
          // dropping these silently loses real notifications.
          if (status === 429 || status >= 500) {
            await new Promise((r) => setTimeout(r, 1000));
            status = await sendPush(sub.endpoint, encryptPush(sub, payload), vapidAuth(sub.endpoint));
          }
          if (status === 404 || status === 410) {
            pushQ.deleteSub.run(sub.endpoint); // the device unsubscribed or the sub expired
            pruned += 1;
          } else if (status >= 200 && status < 300) {
            sent += 1;
          } else {
            failures.set(status, (failures.get(status) ?? 0) + 1);
          }
        } catch (err) {
          // one bad subscription must never stop the broadcast
          failures.set('error', (failures.get('error') ?? 0) + 1);
        }
      }),
    );
  }
  const failed = [...failures].map(([k, v]) => `${k}×${v}`).join(' ');
  // eslint-disable-next-line no-console
  console.log(
    `[push] "${note.body}": ${sent} sent, ${pruned} pruned of ${subs.length}` +
      (failed ? ` — FAILED: ${failed}` : ''),
  );
}

const isB64u = (s, min, max) =>
  typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s);

/**
 * Real push services only. This endpoint is unauthenticated by design (a whole
 * school enabling alerts must not trip a rate limit), so without a host check
 * anyone could register 20k made-up endpoints — filling the cap so real
 * students can never subscribe, and turning every schedule edit into a flood of
 * server-signed POSTs at a host of their choosing.
 */
const PUSH_HOST_SUFFIXES = [
  '.googleapis.com', // Chrome / FCM
  '.push.apple.com', // Safari, iOS
  '.push.services.mozilla.com', // Firefox
  '.notify.windows.com', // Edge / WNS
];

function isPushEndpoint(endpoint) {
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) return false;
  let host;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return false;
  }
  return PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

function handlePushApi(pathname, body) {
  pushDb();
  if (pathname === '/api/push/subscribe') {
    const endpoint = String(body.endpoint || '');
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!isPushEndpoint(endpoint) || !isB64u(p256dh, 80, 200) || !isB64u(auth, 16, 60)) {
      return { status: 400, body: { error: 'invalid subscription' } };
    }
    if (!pushQ.getSub.get(endpoint) && pushQ.countSubs.get().n >= MAX_PUSH_SUBS) {
      return { status: 503, body: { error: 'subscription limit reached' } };
    }
    pushQ.upsertSub.run(endpoint, p256dh, auth, Date.now());
    return { status: 200, body: { ok: true } };
  }
  if (pathname === '/api/push/unsubscribe') {
    const endpoint = String(body.endpoint || '');
    const existing = pushQ.getSub.get(endpoint);
    // Prove ownership: the auth secret is known only to the subscribing device,
    // so learning an endpoint alone can't silence someone else's phone.
    if (existing && (!body.keys?.auth || existing.auth === body.keys.auth)) {
      pushQ.deleteSub.run(endpoint);
    }
    return { status: 200, body: { ok: true } };
  }
  return { status: 404, body: { error: 'not found' } };
}

// The one notification this app sends today: an admin changed a day's bell
// schedule. Fired from the /api/data PUT that carried scheduleDays.
const PUSH_DAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const pushDayName = (iso) => PUSH_DAY_FMT.format(new Date(`${iso}T12:00:00Z`));

/** One changed day, described: what it is now, and when school lets out. */
function describeDayChange(iso, prevDay, day) {
  const when = pushDayName(iso);
  if (!day) return `${when} is back to the regular calendar.`;
  const ends = (day.periods ?? []).map((p) => p.end).sort();
  const dismissal = ends.length ? to12h(ends[ends.length - 1]) : null;
  if (prevDay && prevDay.label === day.label) {
    // Same kind of day, new times: the dismissal is what families care about.
    return dismissal
      ? `${when}: class times changed. Still ${day.label}, dismissal ${dismissal}.`
      : `${when}: ${day.label} updated.`;
  }
  return dismissal ? `${when} is now: ${day.label}. Dismissal ${dismissal}.` : `${when} is now: ${day.label}.`;
}

function notifyScheduleChanges(prevDays, nextDays = {}) {
  // `undefined` means we don't KNOW the previous state (data.json missing or
  // unreadable), not "there were no edits". Diffing against {} there would
  // announce every day on file as a fresh change to the whole school.
  if (prevDays === undefined && Object.keys(nextDays ?? {}).length > 0) return;
  prevDays ??= {};
  const todayIso = DATE_FMT.format(new Date());
  const changed = [...new Set([...Object.keys(prevDays ?? {}), ...Object.keys(nextDays ?? {})])]
    .filter((iso) => iso >= todayIso) // corrections to past days don't deserve a ping
    .filter((iso) => JSON.stringify(prevDays?.[iso] ?? null) !== JSON.stringify(nextDays?.[iso] ?? null))
    .sort();
  if (changed.length === 0) return;
  let text;
  if (changed.length === 1) {
    const iso = changed[0];
    text = describeDayChange(iso, prevDays?.[iso], nextDays?.[iso]);
  } else {
    const named = changed.slice(0, 3).map(pushDayName).join(', ');
    const rest = changed.length - 3;
    text = `Schedule changed for ${named}${rest > 0 ? ` and ${rest} more ${rest === 1 ? 'day' : 'days'}` : ''}. Open the app for the new times.`;
  }
  // Clipped like the banner path: an admin's long day label would otherwise
  // blow past the declared record size and be rejected by every push service.
  const body = text.length > 180 ? `${text.slice(0, 179)}…` : text;
  broadcastPush({ title: 'Schedule change', body, url: '/', tag: 'schedule-change' }).catch(
    // eslint-disable-next-line no-console
    (err) => console.error('[push]', err),
  );
}

/**
 * A NEW school-wide banner (a notice on page '*') notifies everyone with the
 * banner's own text. Edits to an existing banner stay silent so a typo fix
 * doesn't ping 6000 phones; deleting one is silent too.
 */
async function notifyNewBanners(prev = {}, next = {}) {
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const prevIds = new Set((prev.notices ?? []).filter((n) => n.page === '*').map((n) => n.id));
  // A legacy `alert` becomes a notice with this id the first time any client
  // writes. Without seeding it here that migration reads as a brand-new banner,
  // and deleting an unrelated notice re-announces the old one to the school.
  if (prev.alert?.message) prevIds.add('legacy-alert');
  const fresh = (next.notices ?? []).filter((n) => n.page === '*' && n.message && !prevIds.has(n.id));
  // Legacy single-alert writes (pre-notices clients) count as a new banner too.
  if (next.alert?.message && next.alert.message !== prev.alert?.message) {
    fresh.push({ id: 'legacy-alert', message: next.alert.message, tone: next.alert.tone });
  }
  // Sequential, and never more than a couple: a bulk edit must not put ten
  // notifications on every phone or open ten simultaneous fleet-wide sends.
  const send = fresh.slice(0, 2);
  for (const n of send) {
    const title = n.title || (n.tone === 'urgent' ? 'Urgent school notice' : 'School notice');
    await broadcastPush({
      title: clip(title, 60),
      body: clip(n.message, 180),
      url: '/',
      tag: `banner-${n.id}`,
    }).catch(
      // eslint-disable-next-line no-console
      (err) => console.error('[push]', err),
    );
  }
  if (fresh.length > send.length) {
    await broadcastPush({
      title: 'New school notices',
      body: `${fresh.length - send.length} more notices were posted. Open the app to read them.`,
      url: '/',
      tag: 'banner-bulk',
    }).catch((err) => console.error('[push]', err));
  }
}

// CORS origin. Default '*' keeps the PWA and the Capacitor shells working
// (their origins are capacitor://localhost / http://localhost / "null" for
// file://). Set ALLOWED_ORIGIN to the app's real origin to lock it down — the
// value is echoed verbatim and Vary: Origin is added so caches stay correct.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';

// Staff emails allowed to write shared app data. Empty = any signed-in staff.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const corsHeaders = () => ({
  ...(ALLOWED_ORIGIN
    ? { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, Vary: 'Origin' }
    : { 'Access-Control-Allow-Origin': '*' }),
  // Cross-origin JS can only read ETag if it is exposed — and without the ETag
  // the client can't send If-Match, which silently disables the concurrency
  // guard that stops stale devices from clobbering shared data.
  'Access-Control-Expose-Headers': 'ETag',
});

// Applied to every response, including 204s and 304s.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // The app (and the staff portal in it) has no business inside an iframe.
  'X-Frame-Options': 'DENY',
  // Containment for anything that slips past sanitizeHtml: injected markup can
  // still not load a remote script or exfiltrate the staff token to another
  // host. 'unsafe-inline'/'unsafe-eval' are required by the Next.js runtime;
  // img/connect stay wide because tiles and the school's own feeds are remote.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

// ---- Campus map tiles (cached forever) -----------------------------------------
// The basemap imagery never changes — only admin pins/outlines do — so each
// tile is fetched from the provider ONCE, stored on disk, and served from here
// forever after. 6000 devices never touch Esri/OSM directly. Only tiles inside
// a tight box around the SMCHS campus are allowed, which caps the cache to a
// few hundred tiles and keeps the endpoint useless as a general proxy.

const TILE_DIR = new URL('./.data/tiles/', import.meta.url);
const TILE_SOURCES = {
  // Esri World_Imagery uses {z}/{y}/{x} path order.
  sat: {
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    ext: '.jpg',
    type: 'image/jpeg',
  },
  osm: {
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    ext: '.png',
    type: 'image/png',
  },
};
// Campus anchor 33.6435921,-117.5804334 (src/config/campus3d/geo.ts) ± ~2 km.
const TILE_BOUNDS = { latMin: 33.6236, latMax: 33.6636, lngMin: -117.606, lngMax: -117.555 };
// z19 is already street-detail for a campus. Each extra level quadruples the
// tile count: z20 alone is ~21,000 tiles over these bounds, and the full range
// to z20 is ~56,000 tiles (1-3 GB) that any caller could pull down at will.
const TILE_ZOOM = { min: 12, max: 19 };

/** Slippy-map tile index for a lat/lng at zoom z. */
function tileIndex(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x, y };
}

function tileInBounds(z, x, y) {
  if (z < TILE_ZOOM.min || z > TILE_ZOOM.max) return false;
  const a = tileIndex(TILE_BOUNDS.latMax, TILE_BOUNDS.lngMin, z); // top-left
  const b = tileIndex(TILE_BOUNDS.latMin, TILE_BOUNDS.lngMax, z); // bottom-right
  return x >= a.x && x <= b.x && y >= a.y && y <= b.y;
}

const tileInflight = new Map();

async function serveTile(res, pathname) {
  const m = pathname.match(/^\/api\/tiles\/(sat|osm)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/);
  if (!m) return send(res, 404, { error: 'not found' });
  const source = TILE_SOURCES[m[1]];
  const [z, x, y] = [Number(m[2]), Number(m[3]), Number(m[4])];
  if (!tileInBounds(z, x, y)) return send(res, 404, { error: 'outside campus' });

  const fileUrl = new URL(`./${m[1]}/${z}/${x}/${y}${source.ext}`, TILE_DIR);
  const headers = {
    'Content-Type': source.type,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ...corsHeaders(),
    ...SECURITY_HEADERS,
  };
  try {
    const body = fs.readFileSync(fileUrl);
    res.writeHead(200, headers);
    return res.end(body);
  } catch {
    // Not cached yet: fetch once (single-flight per tile), store, serve.
  }
  const key = `${m[1]}/${z}/${x}/${y}`;
  if (!tileInflight.has(key)) {
    tileInflight.set(
      key,
      (async () => {
        const r = await fetch(source.url(z, x, y), {
          headers: { 'User-Agent': 'SMCHS-app tile cache (school deployment)' },
        });
        if (!r.ok) throw new Error(`tile upstream ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        const dir = new URL(`./${m[1]}/${z}/${x}/`, TILE_DIR);
        fs.mkdirSync(dir, { recursive: true });
        // tmp+rename: a crash mid-write would otherwise cache a truncated image
        // that is then served immutable for a year with no invalidation path.
        const tmp = new URL(`${y}.${process.pid}.tmp`, dir);
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, fileUrl);
        return buf;
      })().finally(() => tileInflight.delete(key)),
    );
  }
  try {
    const buf = await tileInflight.get(key);
    res.writeHead(200, headers);
    return res.end(buf);
  } catch {
    return send(res, 502, { error: 'tile unavailable' });
  }
}

// ---- Static app serving --------------------------------------------------------
// In production the same process serves the static export (out/) and /api/*,
// so the app runs same-origin on any domain with no separate web server.

const OUT_DIR = new URL('../out/', import.meta.url);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.pdf': 'application/pdf',
};

function serveFile(res, fileUrl, ext, cacheControl, status = 200) {
  const body = fs.readFileSync(fileUrl);
  res.writeHead(status, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': cacheControl,
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'method not allowed' });
  }
  // Normalize + sandbox: decode, strip traversal, resolve inside out/ only.
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, { error: 'bad path' });
  }
  p = p.replace(/\\/g, '/');
  if (p.includes('..') || p.includes('\0')) return send(res, 404, { error: 'not found' });
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/index.html' || p === '') p = '/index.html';

  const fileUrl = new URL('.' + p, OUT_DIR);
  if (!fileUrl.pathname.startsWith(OUT_DIR.pathname)) return send(res, 404, { error: 'not found' });

  const dot = p.lastIndexOf('.');
  const ext = dot > p.lastIndexOf('/') ? p.slice(dot) : '';
  try {
    if (!ext) throw new Error('route'); // "/today" → the route fallback below
    // Hashed build assets are immutable; HTML and the service worker must
    // revalidate so a deploy actually reaches devices.
    const immutable = p.startsWith('/_next/static/');
    const cache = immutable
      ? 'public, max-age=31536000, immutable'
      : ext === '.html' || p === '/sw.js'
        ? 'no-cache'
        : 'public, max-age=3600';
    return serveFile(res, fileUrl, ext, cache);
  } catch {
    // trailingSlash routes arrive without the slash too ("/today" → /today/index.html)
    try {
      return serveFile(res, new URL('.' + p + '/index.html', OUT_DIR), '.html', 'no-cache');
    } catch {
      try {
        return serveFile(res, new URL('./404.html', OUT_DIR), '.html', 'no-cache', 404);
      } catch {
        return send(res, 404, { error: 'not found' });
      }
    }
  }
}

function send(res, status, body, { fresh = false, headers = {} } = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match, If-Match',
    ...SECURITY_HEADERS,
    // Auth replies and app data must never be served stale; the feeds can be.
    'Cache-Control': fresh ? 'no-store' : 'public, max-age=300',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

// ---- Staff directory: last good scrape on disk ---------------------------------
// The full-roster scrape walks ~40+ pages sequentially (the site rate-limits),
// so a cold scrape takes ~30-60s — long enough to look "stuck" in the app. Keep
// the last good result on disk: serve it instantly on boot and refresh in the
// background, so nobody ever waits on the scrape.

const STAFF_FILE = new URL('./.data/staff.json', import.meta.url);

async function scrapeStaffAndSave() {
  const dir = await scrapeStaff();
  // The roster gates password setup: if a markup change (or a WAF page served
  // as 200) parses to nothing, saving it would lock every staff member out of
  // account creation until someone noticed. Keep the last good copy instead.
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
  } catch {
    /* no previous roster */
  }
  const before = previous?.staff?.length ?? 0;
  const after = dir.staff?.length ?? 0;
  if (before > 0 && after < before * 0.75) {
    console.error(`[staff] scrape returned ${after} of ${before} — keeping the previous roster`);
    return previous;
  }
  if (after === 0 && before === 0) return dir; // genuinely nothing yet; don't persist emptiness
  writeFileAtomic(STAFF_FILE, JSON.stringify(dir));
  return dir;
}

try {
  cache.set('staff', { at: Date.now(), value: JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8')) });
} catch {
  // no disk copy yet — the background refresh below builds the first one
}
// Routed through cached() so it shares the single-flight slot: calling
// scrapeStaffAndSave directly meant a request arriving during the boot scrape
// started a SECOND 30-60s scrape of a site that rate-limits bursts, with both
// writing the roster.
const refreshStaff = () => cached('staff', scrapeStaffAndSave, 0).catch(() => {});
refreshStaff(); // keep serving the disk copy when smhs.org is unreachable

// Re-scrape once a day, in the background — requests never trigger a blocking
// scrape (the serve TTL below is 25h, just past this interval).
const DAY_MS = 24 * 60 * 60 * 1000;
setInterval(refreshStaff, DAY_MS).unref();

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    // Inside the try: a malformed request line makes this throw, and an escaped
    // rejection here would take the process down.
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.startsWith('/api/tiles/')) {
      return serveTile(res, url.pathname);
    }

    if (url.pathname === '/api/health') {
      return send(res, 200, { ok: true, calendar: calConfigured() ? 'bellcalsync' : 'legacy' });
    }

    if (url.pathname === '/api/events') {
      // Optional team filter (?sport=&gender=&tentative=1) for in-app previews.
      const sport = url.searchParams.get('sport') || '';
      // ?history=1 adds the archived past the feed no longer carries. Opt-in:
      // the default answer stays one school year, so an app launch doesn't pull
      // down years of finished events to show a "what's on" list.
      const wantHistory = url.searchParams.get('history') === '1';
      if (calConfigured()) {
        const gender = url.searchParams.get('gender') || '';
        const tentative = url.searchParams.get('tentative') === '1';
        // Same reason as /api/weekly: these become cache keys, so bound their
        // shape rather than letting a caller invent keys at will.
        if (!/^[\w '&-]{0,40}$/.test(sport) || !/^[\w '&-]{0,20}$/.test(gender)) {
          return send(res, 400, { error: 'bad filter' });
        }
        const key = sport ? `events-${sport}|${gender}|${tentative}` : 'events';
        const live = await cached(key, async () => {
          const list = await calEvents(sport ? { sport, gender, tentative } : {});
          // A ?sport= fetch asks upstream for that team only, so the result is a
          // subset and must not be archived. The unfiltered fetch is complete.
          return sport ? list : archiveEvents(list);
        });
        // Cached on its own key: the merge reads and sorts the whole archive,
        // and the default answer must not pay for a feature it doesn't use.
        const events =
          wantHistory && !sport
            ? await cached('events-history', async () => withEventHistory(live))
            : live;
        return send(res, 200, { source: 'bellcalsync', count: events.length, events });
      }
      // The legacy path always fetches the WHOLE ics and filters afterwards, so
      // what reaches archiveEvents is complete no matter what the caller asked
      // for — `?sport=` narrows `all` below, never the fetch itself.
      const all = await cached('events', async () =>
        archiveEvents(parseEvents(await fetchText(SOURCES.ical))),
      );
      const events = sport
        ? all.filter((e) => e.category === 'athletics')
        : wantHistory
          ? await cached('events-history', async () => withEventHistory(all))
          : all;
      return send(res, 200, { source: 'calendarwiz', count: events.length, events });
    }

    if (url.pathname === '/api/sports') {
      if (!calConfigured()) return send(res, 200, { source: 'none', sports: [] });
      const j = await cached('sports', () => calApi('/sports'), SPORTS_TTL_MS);
      return send(res, 200, { source: 'bellcalsync', sports: j.sports || [] });
    }

    if (url.pathname === '/api/weekly') {
      // The board's element id, parsed from the listing once (cached).
      const eid = await cached('weekly-eid', async () => weeklyElementId(await fetchText(SOURCES.weekly)));
      if (!eid) return send(res, 200, { source: 'smhs.org', items: [], hasMore: false });

      // Single post (full body) — used by the in-app reading page. The id is
      // validated before it becomes a cache key: unbounded caller-controlled
      // keys grow the cache map forever (it never evicts) and each miss is a
      // real request to smhs.org.
      const postId = url.searchParams.get('post');
      if (postId !== null && !/^\d{1,9}$/.test(postId)) {
        return send(res, 400, { error: 'bad post id' });
      }
      if (postId) {
        const post = await cached(`weekly-post-${postId}`, async () =>
          parseWeeklyPost(await fetchText(WEEKLY_POPUP(eid, postId), XHR_HEADERS)),
        );
        return send(res, 200, { source: 'smhs.org', item: { id: `weekly-${postId}`, ...post } });
      }

      // One page of post stubs (title only) — mirrors the site's "Load More".
      // Clamped, so ?page=1e12 can't mint an unbounded number of cache keys.
      const page = Math.min(500, Math.max(1, Number(url.searchParams.get('page')) || 1));
      const startRow = (page - 1) * WEEKLY_PAGE_SIZE + 1;
      const { items, hasMore } = await cached(`weekly-page-${page}`, async () => {
        const { posts, hasMore } = parseWeeklyList(await fetchText(WEEKLY_PAGE(eid, startRow), XHR_HEADERS));
        return { items: posts.map((p) => ({ id: p.id, title: p.title })), hasMore };
      });
      return send(res, 200, { source: 'smhs.org', page, hasMore, count: items.length, items });
    }

    if (url.pathname === '/api/schedule') {
      if (calConfigured()) {
        const days = await cached('schedule', async () => withScheduleHistory(await calSchedule()));
        return send(res, 200, { source: 'bellcalsync', count: Object.keys(days).length, days });
      }
      const days = await cached('schedule', async () =>
        withScheduleHistory(parseSchedule(await fetchText(SOURCES.bell))),
      );
      return send(res, 200, { source: 'calendarwiz', count: Object.keys(days).length, days });
    }

    if (url.pathname === '/api/staff') {
      const dir = await cached('staff', scrapeStaffAndSave, STAFF_TTL_MS);
      return send(res, 200, { source: 'smhs.org', count: dir.staff.length, ...dir });
    }

    if (url.pathname === '/api/dining') {
      const dining = await cached('dining', async () => parseDining(await fetchText(SOURCES.dining)), CAMPUS_TTL_MS);
      return send(res, 200, { source: 'smhs.org', ...dining });
    }

    if (url.pathname === '/api/clubs') {
      const data = await cached('clubs', async () => parseClubs(await fetchText(SOURCES.clubs)), CAMPUS_TTL_MS);
      return send(res, 200, { source: 'smhs.org', count: data.clubs.length, ...data });
    }

    if (url.pathname === '/api/campus') {
      const campus = await cached('campus', async () => parseCampus(await fetchText(SOURCES.campus)), CAMPUS_TTL_MS);
      return send(res, 200, { source: 'smhs.org', count: campus.buildings.length, ...campus });
    }

    if (url.pathname === '/api/safety') {
      const safety = await cached('safety', async () => parseSafety(await fetchText(SOURCES.safety)), CAMPUS_TTL_MS);
      return send(res, 200, { source: 'smhs.org', ...safety });
    }

    if (url.pathname === '/api/data') {
      const { status, body, etag } = await handleData(req);
      if (status === 200 && etag && req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag, ...corsHeaders(), ...SECURITY_HEADERS });
        return res.end();
      }
      return send(res, status, body, { fresh: true, headers: etag ? { ETag: etag } : {} });
    }

    if (url.pathname === '/api/push/key') {
      return send(res, 200, { key: pushPublicKey() });
    }

    if (url.pathname.startsWith('/api/push/') && req.method === 'POST') {
      // Not behind the auth rate limit: on launch day a whole school enabling
      // alerts behind one NAT must not trip it. Validation above is the guard.
      const { status, body } = handlePushApi(url.pathname, await readBody(req, 5000));
      return send(res, status, body, { fresh: true });
    }

    // ---- Anonymous usage metrics + support tickets (see server/metrics.mjs) ----

    if (url.pathname === '/api/metrics/events' && req.method === 'POST') {
      // Unauthenticated like /api/push/*: every device reports, and the shape
      // validation inside is the guard. No cookies, no identity — the body
      // carries only the app's random device id, a role, and event types.
      const { status, body } = recordMetricsEvents(await readBody(req, 20_000));
      return send(res, status, body, { fresh: true });
    }

    if (url.pathname === '/api/metrics/summary') {
      // Aggregates only, and admins only: the same bar as writing app data.
      const email = sessionEmail(req);
      if (!email) return send(res, 401, { error: 'staff sign-in required' }, { fresh: true });
      if (!(await isAdminEmail(email))) {
        return send(res, 403, { error: 'admin access required' }, { fresh: true });
      }
      return send(res, 200, metricsSummary(), { fresh: true });
    }

    if (url.pathname === '/api/support/tickets' && req.method === 'POST') {
      const retryAfter = ticketRateLimit(req);
      if (retryAfter) {
        return send(
          res,
          429,
          { error: 'Too many tickets right now. Try again in a few minutes.' },
          { fresh: true, headers: { 'Retry-After': String(retryAfter) } },
        );
      }
      const { status, body } = createSupportTicket(await readBody(req, 20_000));
      return send(res, status, body, { fresh: true });
    }

    if (url.pathname === '/api/support/status') {
      // A device asking about ITS OWN tickets. The device id is the capability:
      // it is random, unguessable, and known only to the device that minted it.
      const { status, body } = supportStatusForDevice(url.searchParams.get('device'));
      return send(res, status, body, { fresh: true });
    }

    if (url.pathname === '/api/support/list' || url.pathname === '/api/support/resolve') {
      const email = sessionEmail(req);
      if (!email) return send(res, 401, { error: 'staff sign-in required' }, { fresh: true });
      if (!(await isAdminEmail(email))) {
        return send(res, 403, { error: 'admin access required' }, { fresh: true });
      }
      if (url.pathname === '/api/support/resolve' && req.method === 'POST') {
        const { status, body } = setSupportResolved(await readBody(req));
        return send(res, status, body, { fresh: true });
      }
      const { status, body } = listSupportTickets();
      return send(res, status, body, { fresh: true });
    }

    if (url.pathname === '/api/auth/admins' && req.method === 'GET') {
      // The hand-granted admin list, readable pre-auth: the Admin portal's
      // sign-in picker has to offer a granted teacher BEFORE they sign in, and
      // the Admins page needs it to hide people who already have access. This
      // reveals nothing the public roster + the bundled department/title lists
      // don't already: staff emails are public directory data.
      authDb();
      return send(res, 200, { emails: authQ.listGrants.all().map((r) => r.email) }, { fresh: true });
    }

    if (url.pathname.startsWith('/api/auth/') && req.method === 'POST') {
      // /api/auth/session is exempt from the guessing limiter. It only ever
      // checks a 192-bit random bearer token — the same check every other
      // staff route does unlimited (PUT /api/data, /api/metrics/summary…) —
      // and it is called on every app launch. Behind a school NAT the shared
      // 10/min bucket would 429 real sign-ins all day.
      const retryAfter = url.pathname === '/api/auth/session' ? 0 : rateLimit(req);
      if (retryAfter) {
        return send(
          res,
          429,
          { error: 'Too many attempts. Try again in a minute.' },
          { fresh: true, headers: { 'Retry-After': String(retryAfter) } },
        );
      }
      const { status, body, headers } = await handleAuth(url.pathname, await readBody(req), req);
      return send(res, status, body, { fresh: true, headers });
    }

    // Anything that isn't /api/* is the app itself: serve the static export.
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    // A malformed body is the caller's error, not an upstream failure.
    if (err?.badRequest) return send(res, 400, { error: 'invalid JSON body' }, { fresh: true });
    // Detail stays server-side: upstream URLs, file paths and parser internals
    // are not the client's business.
    // eslint-disable-next-line no-console
    console.error('[request]', req.method, req.url, err);
    return send(res, 502, { error: 'Upstream request failed' }, { fresh: true });
  }
});

// A single bad request must never take the proxy down for the whole school.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', err);
});

// ---- Boot warnings ---------------------------------------------------------
// Big, yellow, impossible to miss. Each one is a condition that makes a REAL
// school deployment broken or unsafe; on a dev box they're expected and serve
// as a reminder of what this boot is not.

function bootWarning(lines) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const color = process.stdout.isTTY ? '\x1b[1;33m' : ''; // bold yellow on terminals
  const reset = color ? '\x1b[0m' : '';
  const bar = '═'.repeat(width);
  const rows = lines.map((l) => `║  ${l.padEnd(width - 4)}  ║`);
  console.warn(`${color}\n╔${bar}╗\n${rows.join('\n')}\n╚${bar}╝${reset}\n`);
}

if (
  !process.env.SMTP_HOST ||
  Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS) ||
  (!process.env.SMTP_USER && !process.env.SMTP_FROM)
) {
  bootWarning([
    '⚠⚠⚠  SMTP IS NOT CONFIGURED  ⚠⚠⚠',
    '',
    'Staff password setup CANNOT complete: the server refuses to hand',
    'setup links back over HTTP, so no staff account can be created',
    'until email works. Set SMTP_HOST / SMTP_PORT / SMTP_FROM in .env',
    'before a real deployment — plus SMTP_USER / SMTP_PASS for an',
    'authenticated relay (they must be set together; leave BOTH empty',
    'only for an anonymous internal relay, which also needs SMTP_FROM).',
  ]);
} else if (!process.env.SMTP_USER) {
  // Legitimate config, but worth a line in the log: no AUTH is sent and the
  // message (which carries the setup link) crosses the network to the relay
  // in the clear, so this is only for a relay on a trusted network.
  const mailPort = Number(process.env.SMTP_PORT) || 465;
  console.log(
    `[mail] anonymous relay mode: SMTP to ${process.env.SMTP_HOST}:${mailPort}, no AUTH` +
      (mailPort === 465 ? ' (implicit TLS)' : ' (unencrypted)'),
  );
}

if (!process.env.APP_ORIGIN) {
  bootWarning([
    '⚠⚠⚠  APP_ORIGIN IS NOT SET  ⚠⚠⚠',
    '',
    'Password-setup emails would contain a link with NO domain,',
    'which is broken for the recipient. Set APP_ORIGIN to the',
    "app's public address (e.g. https://app.smhs.org).",
  ]);
}

if (process.env.ALLOW_TEST_ACCOUNTS || process.env.NEXT_PUBLIC_TEST_ACCOUNTS) {
  bootWarning([
    '⚠⚠⚠  TEST ACCOUNTS ARE ENABLED  ⚠⚠⚠',
    '',
    'ALLOW_TEST_ACCOUNTS / NEXT_PUBLIC_TEST_ACCOUNTS is set: this',
    'boot allows passwordless test identities and returns password-',
    'setup links directly in HTTP responses (account takeover if',
    'exposed). NEVER run a real school deployment this way.',
  ]);
}

// Loopback by default: this port is plain HTTP, and in production a TLS
// reverse proxy on the same machine is the only thing that should reach it.
// Binding every interface by default meant the unencrypted port was directly
// reachable on the LAN, carrying staff Bearer tokens in the clear. Set
// HOST=0.0.0.0 deliberately (LAN testing, or a proxy on another host).
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`SMCHS app + API on http://${HOST}:${PORT}`);
});
