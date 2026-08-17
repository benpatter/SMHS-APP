/**
 * Anonymous usage metrics + support tickets for the SMCHS app server.
 *
 * Privacy is the design constraint, not a feature flag — the app serves
 * minors in California (FERPA / SOPIPA / CCPA posture, see README):
 *   - Devices are known ONLY by a client-generated random UUID kept in the
 *     app's localStorage. No cookies, no names, no emails, no IP addresses
 *     are ever stored here. The id links to nothing outside this database.
 *   - Events say WHAT happened (screen opened, session ended), the viewer's
 *     ROLE (student/parent/teacher/admin), and WHEN — nothing else.
 *   - Usage rows are hard-deleted 30 days after collection; the dashboards
 *     only ever aggregate (counts, averages, percentages) split by role.
 *   - Support tickets are the one thing that persists past 30 days, and the
 *     sender stays anonymous: the device id on a ticket exists only so the
 *     sender's own device can learn its ticket was resolved, and it is never
 *     included in what admins see.
 *
 * Same zero-npm-deps rule as index.mjs: node:sqlite + built-ins only.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = new URL('./.data/', import.meta.url);
const DB_FILE = new URL('./.data/metrics.db', import.meta.url);

const RETENTION_DAYS = 30; // aggregate data is viewable ≤30 days, then gone
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export const METRIC_ROLES = ['student', 'parent', 'teacher', 'admin'];

// The full event vocabulary. Anything else is rejected at the door.
const EVENT_TYPES = new Set([
  'open', // app launched / returned to the foreground
  'screen', // a screen was viewed (name = normalized route)
  'feature', // a major action was taken (name = feature key)
  'session', // a session ended (value = seconds the app was open)
  'announcement', // an announcement was opened
  'notif_on', // notifications were opted into
  'notif_off', // notifications were opted out of
]);

const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;
// "/home", "/more/menu", "grades", "support-ticket" — nothing else. No dots,
// so path-looking junk can't end up as a row in the adoption dashboard.
const NAME_RE = /^\/?[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/;
const MAX_EVENTS_PER_POST = 25;
const MAX_SESSION_SECONDS = 4 * 60 * 60; // clamp: nobody's "session" is 4h+

const TZ = 'America/Los_Angeles';
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date at the school ("YYYY-MM-DD"). */
const todayIso = () => DAY_FMT.format(new Date());

/** iso date ± n days (dates are TZ-independent once anchored at noon UTC). */
function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday that starts the week containing `iso` (school weeks start Monday). */
function weekStartOf(iso) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return addDays(iso, -((dow + 6) % 7));
}

let db;
let q; // prepared statements

function metricsDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const path = fileURLToPath(DB_FILE);
  db = new DatabaseSync(path);
  // 0600 like everything under .data/ — this db holds no secrets, but there is
  // no reason for other local accounts to read usage data either.
  try { fs.chmodSync(path, 0o600); } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id  TEXT PRIMARY KEY,
      role       TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen  INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      role      TEXT NOT NULL,
      type      TEXT NOT NULL,
      name      TEXT,
      value     INTEGER,
      day       TEXT NOT NULL,
      at        INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
    CREATE INDEX IF NOT EXISTS idx_events_day_role ON events(day, role);
    CREATE INDEX IF NOT EXISTS idx_events_type_day ON events(type, day);
    CREATE INDEX IF NOT EXISTS idx_events_device_day ON events(device_id, day);
    CREATE TABLE IF NOT EXISTS tickets (
      num           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id     TEXT NOT NULL,
      role          TEXT NOT NULL,
      subject       TEXT NOT NULL,
      body          TEXT NOT NULL,
      contact_email TEXT,
      created_at    INTEGER NOT NULL,
      resolved_at   INTEGER
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_tickets_device ON tickets(device_id);
  `);
  // Databases created before the optional contact email existed lack the column.
  const ticketCols = db.prepare('SELECT name FROM pragma_table_info(?)').all('tickets');
  if (!ticketCols.some((c) => c.name === 'contact_email')) {
    db.exec('ALTER TABLE tickets ADD COLUMN contact_email TEXT');
  }
  q = {
    upsertDevice: db.prepare(
      'INSERT INTO devices (device_id, role, first_seen, last_seen) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(device_id) DO UPDATE SET role = excluded.role, last_seen = excluded.last_seen',
    ),
    insertEvent: db.prepare(
      'INSERT INTO events (device_id, role, type, name, value, day, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    purgeEvents: db.prepare('DELETE FROM events WHERE day < ?'),
    purgeDevices: db.prepare('DELETE FROM devices WHERE last_seen < ?'),
    dailyActive: db.prepare(
      'SELECT day, role, COUNT(DISTINCT device_id) AS n FROM events WHERE day >= ? GROUP BY day, role',
    ),
    weeklyActive: db.prepare(
      'SELECT role, COUNT(DISTINCT device_id) AS n FROM events WHERE day BETWEEN ? AND ? GROUP BY role',
    ),
    // Devices active in [curStart..curEnd] that were ALSO active the week before.
    returning: db.prepare(
      'SELECT e1.role AS role, COUNT(DISTINCT e1.device_id) AS n FROM events e1 ' +
        'WHERE e1.day BETWEEN ? AND ? AND EXISTS (' +
        '  SELECT 1 FROM events e2 WHERE e2.device_id = e1.device_id AND e2.day BETWEEN ? AND ?' +
        ') GROUP BY e1.role',
    ),
    sessions: db.prepare(
      "SELECT role, COUNT(*) AS n, AVG(value) AS avg_s FROM events WHERE type = 'session' " +
        'AND day BETWEEN ? AND ? GROUP BY role',
    ),
    announcementOpeners: db.prepare(
      "SELECT role, COUNT(DISTINCT device_id) AS n FROM events WHERE type = 'announcement' " +
        'AND day BETWEEN ? AND ? GROUP BY role',
    ),
    notifCounts: db.prepare(
      "SELECT role, type, COUNT(*) AS n FROM events WHERE type IN ('notif_on', 'notif_off') " +
        'AND day BETWEEN ? AND ? GROUP BY role, type',
    ),
    adoption: db.prepare(
      "SELECT role, name, COUNT(DISTINCT device_id) AS n FROM events WHERE type IN ('screen', 'feature') " +
        'AND day >= ? AND name IS NOT NULL GROUP BY role, name',
    ),
    monthlyActive: db.prepare(
      'SELECT role, COUNT(DISTINCT device_id) AS n FROM events WHERE day >= ? GROUP BY role',
    ),
    knownDevices: db.prepare('SELECT COUNT(*) AS n FROM devices'),
    countEvents: db.prepare('SELECT COUNT(*) AS n FROM events'),
    insertTicket: db.prepare(
      'INSERT INTO tickets (device_id, role, subject, body, contact_email, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    ticketsForDevice: db.prepare(
      'SELECT num, subject, created_at, resolved_at FROM tickets WHERE device_id = ? ORDER BY num DESC LIMIT 50',
    ),
    ticketsRecentByDevice: db.prepare(
      'SELECT COUNT(*) AS n FROM tickets WHERE device_id = ? AND created_at > ?',
    ),
    // Admin list: the device id is deliberately NOT selected — senders are
    // anonymous unless they typed a contact email themselves.
    listTickets: db.prepare(
      'SELECT num, role, subject, body, contact_email, created_at, resolved_at FROM tickets ORDER BY num DESC LIMIT 500',
    ),
    resolveTicket: db.prepare('UPDATE tickets SET resolved_at = ? WHERE num = ?'),
    reopenTicket: db.prepare('UPDATE tickets SET resolved_at = NULL WHERE num = ?'),
  };
  purgeOldMetrics();
  // The 30-day limit is a promise, not a query filter: expired rows are
  // physically deleted on a timer, so they are unrecoverable even from the
  // database file itself.
  setInterval(purgeOldMetrics, PURGE_INTERVAL_MS).unref();
  return db;
}

export function purgeOldMetrics() {
  if (!db) return;
  const cutoffDay = addDays(todayIso(), -RETENTION_DAYS);
  q.purgeEvents.run(cutoffDay);
  q.purgeDevices.run(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

// ---- Ingestion ----------------------------------------------------------------

const validRole = (r) => METRIC_ROLES.includes(r);

// Disk-fill backstop for the unauthenticated ingest endpoint. The per-IP rate
// limit that guards tickets can't be applied here — a whole school behind one
// NAT legitimately reports thousands of batches an hour — so the bound is on
// what a flood could actually cost: total stored rows. Far above any real
// fleet's 30-day volume (~6000 devices never come close); once crossed, reports
// are acknowledged and dropped until the purge frees space. Telemetry is
// best-effort by design — tickets are unaffected.
const EVENT_ROW_CAP = 10_000_000;
const DEVICE_ROW_CAP = 50_000;
let capCheckedAt = 0;
let overCap = false;

function ingestOverCap() {
  const now = Date.now();
  if (now - capCheckedAt > 30_000) {
    capCheckedAt = now;
    overCap =
      (q.countEvents.get()?.n ?? 0) > EVENT_ROW_CAP ||
      (q.knownDevices.get()?.n ?? 0) > DEVICE_ROW_CAP;
  }
  return overCap;
}

/**
 * One batched report from a device: { device, role, events: [{t, n?, v?}] }.
 * The server stamps the time itself — client clocks are not trusted — and the
 * whole shape is validated before anything touches the database.
 */
export function recordMetricsEvents(body) {
  metricsDb();
  const device = String(body?.device || '');
  const role = String(body?.role || '');
  const events = body?.events;
  if (!DEVICE_RE.test(device) || !validRole(role) || !Array.isArray(events)) {
    return { status: 400, body: { error: 'invalid report' } };
  }
  if (ingestOverCap()) return { status: 200, body: { ok: true, accepted: 0 } };
  const now = Date.now();
  const day = todayIso();
  // "When a device opens the app it is remembered on the server" — the device
  // row IS that memory, before any specific event is even looked at.
  q.upsertDevice.run(device, role, now, now);
  let accepted = 0;
  for (const ev of events.slice(0, MAX_EVENTS_PER_POST)) {
    const type = String(ev?.t || '');
    if (!EVENT_TYPES.has(type)) continue;
    let name = null;
    if (ev?.n !== undefined) {
      name = String(ev.n).toLowerCase();
      if (!NAME_RE.test(name)) continue;
    }
    let value = null;
    if (type === 'session') {
      value = Math.round(Number(ev?.v));
      if (!Number.isFinite(value) || value < 0) continue;
      value = Math.min(value, MAX_SESSION_SECONDS);
      if (value < 1) continue; // sub-second blips aren't sessions
    }
    q.insertEvent.run(device, role, type, name, value, day, now);
    accepted += 1;
  }
  return { status: 200, body: { ok: true, accepted } };
}

// ---- Aggregation (the admin dashboard's numbers) -------------------------------

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** rows [{role, ...}] → { student: row, parent: row, ... } */
function byRole(rows) {
  const out = {};
  for (const r of rows) if (validRole(r.role)) out[r.role] = r;
  return out;
}

/**
 * Everything the metrics dashboard shows, computed fresh from the last 30 days
 * of events. Weeks start Monday (school time); the newest bucket is the current
 * week, which is what "refreshes at the start of every week" — a new bucket
 * opens and last week's numbers freeze.
 */
export function metricsSummary() {
  metricsDb();
  const today = todayIso();
  const windowStart = addDays(today, -(RETENTION_DAYS - 1));
  const thisWeekStart = weekStartOf(today);

  // Daily active counts once, bucketed into weeks in JS (≤30 distinct days).
  const daily = q.dailyActive.all(windowStart);
  const dailyByWeek = new Map(); // weekStart -> role -> [counts]
  for (const row of daily) {
    if (!validRole(row.role)) continue;
    const wk = weekStartOf(row.day);
    if (!dailyByWeek.has(wk)) dailyByWeek.set(wk, {});
    (dailyByWeek.get(wk)[row.role] ??= []).push(row.n);
  }

  const weeks = [];
  for (let wkStart = thisWeekStart; addDays(wkStart, 6) >= windowStart; wkStart = addDays(wkStart, -7)) {
    const start = wkStart < windowStart ? windowStart : wkStart; // clip to the 30-day window
    const end = addDays(wkStart, 6) > today ? today : addDays(wkStart, 6);
    const prevStart = addDays(wkStart, -7);
    const prevEnd = addDays(wkStart, -1);

    const active = byRole(q.weeklyActive.all(start, end));
    const prevActive = byRole(q.weeklyActive.all(prevStart < windowStart ? windowStart : prevStart, prevEnd));
    const returning = byRole(q.returning.all(start, end, prevStart < windowStart ? windowStart : prevStart, prevEnd));
    const sessions = byRole(q.sessions.all(start, end));
    const annOpeners = byRole(q.announcementOpeners.all(start, end));
    const notif = q.notifCounts.all(start, end);

    const daysElapsed = Math.min(7, Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000) + 1);
    const wkDaily = dailyByWeek.get(wkStart) ?? {};

    const roles = {};
    for (const role of METRIC_ROLES) {
      const weeklyActive = active[role]?.n ?? 0;
      const prevN = prevActive[role]?.n ?? 0;
      const returned = returning[role]?.n ?? 0;
      const sess = sessions[role];
      const dailyCounts = wkDaily[role] ?? [];
      roles[role] = {
        weeklyActive,
        // "an average over a week": mean daily actives across the days elapsed.
        avgDailyActive: daysElapsed > 0 ? Math.round(((dailyCounts.reduce((a, b) => a + b, 0)) / daysElapsed) * 10) / 10 : 0,
        sessions: sess?.n ?? 0,
        avgSessionMin: sess?.avg_s ? Math.round(sess.avg_s / 6) / 10 : null,
        sessionsPerDevice: weeklyActive > 0 && sess?.n ? Math.round((sess.n / weeklyActive) * 10) / 10 : null,
        // Of last week's active devices, how many came back this week?
        retentionPct: prevN > 0 ? pct(returned, prevN) : null,
        returned,
        lapsed: prevN > 0 ? Math.max(0, prevN - returned) : null,
        announcementOpenPct: pct(annOpeners[role]?.n ?? 0, weeklyActive),
        optIns: notif.find((r) => r.role === role && r.type === 'notif_on')?.n ?? 0,
        optOuts: notif.find((r) => r.role === role && r.type === 'notif_off')?.n ?? 0,
      };
    }
    weeks.push({ start, end, current: wkStart === thisWeekStart, byRole: roles });
  }

  // Feature interest/adoption over the whole 30-day window: what % of a role's
  // active devices used each screen/feature at all.
  const monthly = byRole(q.monthlyActive.all(windowStart));
  const adoption = {};
  for (const role of METRIC_ROLES) adoption[role] = [];
  for (const row of q.adoption.all(windowStart)) {
    if (!validRole(row.role)) continue;
    const total = monthly[row.role]?.n ?? 0;
    adoption[row.role].push({ feature: row.name, users: row.n, pct: pct(row.n, total) ?? 0 });
  }
  for (const role of METRIC_ROLES) {
    adoption[role].sort((a, b) => b.users - a.users);
    adoption[role] = adoption[role].slice(0, 16);
  }

  const monthlyActive = {};
  for (const role of METRIC_ROLES) monthlyActive[role] = monthly[role]?.n ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: RETENTION_DAYS,
    weekStart: thisWeekStart,
    weeks,
    adoption,
    monthlyActive,
    knownDevices: q.knownDevices.get()?.n ?? 0,
  };
}

// ---- Support tickets -----------------------------------------------------------

const MAX_SUBJECT = 120;
const MAX_TICKET_BODY = 4000;
const MAX_CONTACT_EMAIL = 120;
const TICKETS_PER_DEVICE_PER_DAY = 10;

// Deliberately loose (real address shapes vary); this is a contact hint the
// sender CHOSE to include, not an identity check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * { device, role, subject, body, email? } → { num } (the public tracking
 * number). The email is optional and sender-volunteered: it exists so admins
 * have someone to write to when a ticket can't be resolved on its own, and an
 * omitted or malformed one never blocks the ticket — anonymity stays the default.
 */
export function createSupportTicket(body) {
  metricsDb();
  const device = String(body?.device || '');
  const role = String(body?.role || '');
  const subject = String(body?.subject || '').replace(/\s+/g, ' ').trim();
  const text = String(body?.body || '').trim();
  const emailRaw = String(body?.email || '').trim().toLowerCase();
  const contactEmail =
    emailRaw && emailRaw.length <= MAX_CONTACT_EMAIL && EMAIL_RE.test(emailRaw) ? emailRaw : null;
  if (!DEVICE_RE.test(device) || !validRole(role)) {
    return { status: 400, body: { error: 'invalid request' } };
  }
  if (!subject || subject.length > MAX_SUBJECT) {
    return { status: 400, body: { error: `Subject is required (max ${MAX_SUBJECT} characters)` } };
  }
  if (!text || text.length > MAX_TICKET_BODY) {
    return { status: 400, body: { error: `Details are required (max ${MAX_TICKET_BODY} characters)` } };
  }
  // Per-device cap, alongside the per-IP limit in the request handler: one
  // stuck retry loop (or one bored student) must not flood the admin queue.
  const recent = q.ticketsRecentByDevice.get(device, Date.now() - 24 * 60 * 60 * 1000)?.n ?? 0;
  if (recent >= TICKETS_PER_DEVICE_PER_DAY) {
    return { status: 429, body: { error: 'Too many tickets from this device today. Try again tomorrow.' } };
  }
  const r = q.insertTicket.run(device, role, subject, text, contactEmail, Date.now());
  return { status: 200, body: { ok: true, num: Number(r.lastInsertRowid) } };
}

/**
 * The sender's own view: their tickets' numbers and resolved state. Keyed by
 * the device id only that device knows — this is how "your ticket was
 * resolved" reaches an anonymous sender.
 */
export function supportStatusForDevice(device) {
  metricsDb();
  if (!DEVICE_RE.test(String(device || ''))) {
    return { status: 400, body: { error: 'invalid device' } };
  }
  const tickets = q.ticketsForDevice.all(device).map((t) => ({
    num: t.num,
    subject: t.subject,
    createdAt: new Date(t.created_at).toISOString(),
    resolved: t.resolved_at != null,
  }));
  return { status: 200, body: { tickets } };
}

/**
 * Admin view: every ticket. The device id is omitted (anonymous by design);
 * the contact email appears only when the sender chose to provide one.
 */
export function listSupportTickets() {
  metricsDb();
  const tickets = q.listTickets.all().map((t) => ({
    num: t.num,
    role: t.role,
    subject: t.subject,
    body: t.body,
    contactEmail: t.contact_email || null,
    createdAt: new Date(t.created_at).toISOString(),
    resolvedAt: t.resolved_at ? new Date(t.resolved_at).toISOString() : null,
  }));
  return { status: 200, body: { tickets } };
}

/** Admin action: mark a ticket resolved (or reopen it). */
export function setSupportResolved(body) {
  metricsDb();
  const num = Number(body?.num);
  if (!Number.isInteger(num) || num < 1) return { status: 400, body: { error: 'invalid ticket number' } };
  const reopen = body?.resolved === false;
  const r = reopen ? q.reopenTicket.run(num) : q.resolveTicket.run(Date.now(), num);
  if (r.changes !== 1) return { status: 404, body: { error: 'ticket not found' } };
  return { status: 200, body: { ok: true } };
}
