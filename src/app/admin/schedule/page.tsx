'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { applyAthleticsEdits, useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { fetchLiveEvents } from '@/lib/providers/live';
import {
  BELL_SCHEDULES,
  DAY_TYPE_ORDER,
  GRADE_LEVELS,
  type BellPeriod,
  type DayTypeId,
  type GradeLevel,
  type LunchTrack,
} from '@/config/bellSchedules';
import type { SchoolEvent } from '@/config/calendar';
import type { AdminScheduleDay } from '@/lib/types';
import { dayTypeFor } from '@/lib/calendar';
import { nowInSchoolTz, DateTime, formatDayLabel } from '@/lib/time';
import { AdminGate } from '@/components/AdminGate';
import { DayStepper } from '@/components/DayStepper';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Pill,
  SectionTitle,
  Select,
  Spinner,
  TextInput,
  cx,
} from '@/components/ui';
import { PlusIcon, XIcon } from '@/components/icons';

const CATEGORIES: SchoolEvent['category'][] = [
  'academic',
  'athletics',
  'arts',
  'ministry',
  'campus-life',
  'holiday',
];

// ---------------------------------------------------------------------------
// Day schedule editor: pick any date (calendar-style), then edit that day's
// blocks freely — rename, retime, add, remove — or just switch its day type.
// Saves as a full replacement day in the server-owned scheduleDays map.
// ---------------------------------------------------------------------------

/**
 * What a row IS, independent of its display name: the student's period-N class,
 * a lunch (optionally one of the two tracks), a break, or a special activity.
 * Renaming a row never breaks this link — "Chapel Time" linked to Period 4
 * still joins the student's period-4 class.
 */
type PeriodNum = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type RowLink =
  | `p${PeriodNum}`
  // A class that meets at different times per lunch track. Both halves of a
  // dual-lunch day need these, or the day saves untracked and the engine can't
  // tell which lunch a student has.
  | `p${PeriodNum}-first`
  | `p${PeriodNum}-second`
  | 'lunch'
  | 'lunch-first'
  | 'lunch-second'
  | 'break'
  | 'special';

const PERIOD_NUMS = [1, 2, 3, 4, 5, 6, 7] as const;

const LINK_OPTIONS: { value: RowLink; label: string }[] = [
  ...PERIOD_NUMS.map((n) => ({ value: `p${n}` as RowLink, label: `Period ${n}` })),
  { value: 'lunch', label: 'Lunch (everyone)' },
  { value: 'lunch-first', label: '1st Lunch' },
  { value: 'lunch-second', label: '2nd Lunch' },
  ...PERIOD_NUMS.map((n) => ({
    value: `p${n}-first` as RowLink,
    label: `Period ${n} (1st lunch group)`,
  })),
  ...PERIOD_NUMS.map((n) => ({
    value: `p${n}-second` as RowLink,
    label: `Period ${n} (2nd lunch group)`,
  })),
  { value: 'break', label: 'Break' },
  { value: 'special', label: 'Special (Mass, Rally…)' },
];

/** The link a period already carries. */
function linkOf(p: BellPeriod): RowLink {
  if (p.kind === 'class' && p.periodNumber && p.periodNumber >= 1 && p.periodNumber <= 7) {
    return (p.track ? `p${p.periodNumber}-${p.track}` : `p${p.periodNumber}`) as RowLink;
  }
  if (p.kind === 'lunch') return p.track ? (`lunch-${p.track}` as RowLink) : 'lunch';
  if (p.kind === 'break') return 'break';
  return 'special';
}

/**
 * Best-effort link from a typed name ("Period 4" → p4). An unrecognized name
 * KEEPS the current link: renaming Period 4 to "Chapel Time" must not silently
 * turn it into a special block, which is exactly what breaks its join to the
 * student's period-4 class.
 */
function inferLink(label: string, current: RowLink): RowLink {
  const m = label.match(/(?:block|per(?:iod)?\.?)\s*([1-7])\b/i);
  if (m) return `p${m[1]}` as RowLink;
  if (/lunch/i.test(label)) return current.startsWith('lunch') ? current : 'lunch';
  if (/break|nutrition/i.test(label)) return 'break';
  return current;
}

/** All four grades = the period meets for everyone. */
const ALL_GRADES: GradeLevel[] = [...GRADE_LEVELS];

/** One editable line of the day. `base` is the period it started from, so an
 *  untouched row keeps its exact identity (id, lunch track, note). */
interface Row {
  key: string;
  label: string;
  start: string; // "HH:mm"
  end: string;
  /** What this row is linked to (period number / lunch / break / special). */
  link: RowLink;
  /** Whether the admin picked the link by hand (stops label-typing re-inference). */
  linkManual: boolean;
  /** Grade levels attending; all four = everyone. */
  grades: GradeLevel[];
  base: BellPeriod | null;
}

let rowSeq = 0;
const rowKey = () => `row-${++rowSeq}`;

const rowsFromPeriods = (periods: BellPeriod[]): Row[] =>
  periods.map((p) => ({
    key: rowKey(),
    label: p.label,
    start: p.start,
    end: p.end,
    link: linkOf(p),
    linkManual: false,
    grades: p.grades?.length
      ? [...p.grades]
      : p.group === 'jrsr'
        ? [11, 12]
        : p.group === 'frso'
          ? [9, 10]
          : [...ALL_GRADES],
    base: p,
  }));

interface Draft {
  dayType: DayTypeId | null;
  label: string;
  short: string;
  rows: Row[];
}

/** Best-effort day-type tag for a live-calendar day ("Special Mass Day 2" → mass). */
function guessDayType(short: string, label: string): DayTypeId | null {
  const t = `${short} ${label}`.toLowerCase();
  if (t.includes('split')) return 'split-mass';
  if (t.includes('mass')) return 'mass';
  if (t.includes('all period')) return 'all-periods';
  if (t.includes('meeting')) return 'meeting';
  if (t.includes('minimum')) return 'minimum';
  if (t.includes('rally') || t.includes('assembly')) return 'rally';
  if (t.includes('no school')) return 'no-school';
  if (t.includes('regular')) return 'regular';
  return null;
}

const draftFromDay = (day: AdminScheduleDay): Draft => ({
  dayType: day.dayType ?? guessDayType(day.short, day.label),
  label: day.label,
  short: day.short,
  rows: rowsFromPeriods(day.periods),
});

const draftFromTemplate = (id: DayTypeId): Draft => {
  const t = BELL_SCHEDULES[id];
  return { dayType: id, label: t.name, short: t.short, rows: rowsFromPeriods(t.periods) };
};

/**
 * This row's lunch track: chosen via the link, or inherited from the period it
 * loaded as — but only while it still IS that period. Relinking (a first-lunch
 * Period 3 becoming "Senior Rally") must drop the track, or the new row is
 * silently visible to just one lunch group.
 */
const rowTrack = (r: Row): LunchTrack | undefined =>
  r.link.endsWith('-first')
    ? 'first'
    : r.link.endsWith('-second')
      ? 'second'
      : r.base && linkOf(r.base) === r.link
        ? r.base.track
        : undefined;

/** The grade subset that saves (undefined = everyone), always low→high. */
const rowGrades = (r: Row): GradeLevel[] | undefined =>
  r.grades.length > 0 && r.grades.length < ALL_GRADES.length
    ? [...r.grades].sort((a, b) => a - b)
    : undefined;

/** Jr/Sr / Fr/So column assignment when the grade subset is exactly one of them. */
const rowGroup = (r: Row): BellPeriod['group'] => {
  const g = rowGrades(r)?.join();
  return g === '11,12' ? 'jrsr' : g === '9,10' ? 'frso' : undefined;
};

/**
 * A row back to a real period. The explicit link decides what it is — a p4 row
 * joins the student's period-4 class whatever it's named, a lunch row renders
 * as lunch — and the grade chips decide who attends. The note carries over
 * while the name is untouched.
 */
function rowToPeriod(r: Row): BellPeriod {
  const numMatch = /^p([1-7])(?:-(?:first|second))?$/.exec(r.link);
  const num = numMatch ? Number(numMatch[1]) : null;
  const kind: BellPeriod['kind'] = num
    ? 'class'
    : r.link.startsWith('lunch')
      ? 'lunch'
      : r.link === 'break'
        ? 'break'
        : 'special';
  const label =
    r.label.trim() ||
    (num ? `Period ${num}` : kind === 'lunch' ? 'Lunch' : kind === 'break' ? 'Break' : 'Activity');
  const track = rowTrack(r);
  const grades = rowGrades(r);
  // The chips are authoritative. Falling back to the loaded period's `group`
  // re-applied a stale Jr/Sr or Fr/So limit on top of the admin's selection,
  // and the engine filters on `group` FIRST — so a grade they just checked
  // still saw nothing, with the editor showing it as included.
  const group = rowGroup(r);
  return {
    // Keyed on the row, not its index: two rows sharing a link (or a relink
    // colliding with a previous save's index) produced duplicate period ids,
    // which are React keys in every schedule view.
    id: r.base && linkOf(r.base) === r.link ? r.base.id : `edit-${r.key}-${r.link}`,
    label,
    start: r.start,
    end: r.end,
    kind,
    ...(num ? { periodNumber: num } : {}),
    ...(track ? { track } : {}),
    ...(group ? { group } : {}),
    ...(grades ? { grades } : {}),
    ...(r.base?.note && r.base.label === label ? { note: r.base.note } : {}),
  };
}

const validTime = (t: string) => /^\d{2}:\d{2}$/.test(t);
const rowInvalid = (r: Row) => !validTime(r.start) || !validTime(r.end) || r.start >= r.end;

/** "13:55" → "1:55 PM" for the dismissal line. */
function fmt12(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "10:40" + 45 min, for prefiling an added block's end time. */
function plusMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * The editor mirrors BellScheduleView's layout: shared blocks full-width, the
 * lunch-divergent (or grade-divergent) stretch as two parallel columns. Same
 * pairing rules as splitLunchLayout/splitMassLayout, on editable rows — except
 * an untracked row that drifts into the split window lands in `post` instead of
 * disappearing (an editor must never hide a row).
 */
interface RowLayout {
  pre: Row[];
  headers: [string, string] | null;
  pairs: { left?: Row; right?: Row }[];
  post: Row[];
}

function layoutRows(rows: Row[]): RowLayout {
  const byStart = (a: Row, b: Row) => a.start.localeCompare(b.start);
  const groupOf = (r: Row) => rowGroup(r) ?? r.base?.group;
  const tracked = rows.filter((r) => rowTrack(r));
  const grouped = rows.filter(groupOf);
  const split = tracked.length > 0 ? tracked : grouped.length > 0 ? grouped : null;
  if (!split) return { pre: [...rows].sort(byStart), headers: null, pairs: [], post: [] };

  const splitStart = split.map((r) => r.start).sort()[0];
  const inSplit = new Set(split.map((r) => r.key));
  const others = rows.filter((r) => !inSplit.has(r.key));
  // One boundary, so every row lands in exactly one list — an editor must
  // never hide a row (matches splitLunchLayout on the student side).
  const pre = others.filter((r) => r.start < splitStart).sort(byStart);
  const post = others.filter((r) => r.start >= splitStart).sort(byStart);

  const lunch = tracked.length > 0;
  const left = split.filter((r) => (lunch ? rowTrack(r) === 'first' : groupOf(r) === 'jrsr')).sort(byStart);
  const right = split.filter((r) => (lunch ? rowTrack(r) === 'second' : groupOf(r) === 'frso')).sort(byStart);
  const pairs = Array.from({ length: Math.max(left.length, right.length) }, (_, i) => ({
    left: left[i],
    right: right[i],
  }));
  return {
    pre,
    headers: lunch ? ['1st Lunch', '2nd Lunch'] : ['Jr/Sr', 'Fr/So'],
    pairs,
    post,
  };
}

/** The kind this row will save as (drives the row tint). */
const rowKind = (r: Row): BellPeriod['kind'] =>
  /^p[1-7]/.test(r.link)
    ? 'class'
    : r.link.startsWith('lunch')
      ? 'lunch'
      : r.link === 'break'
        ? 'break'
        : 'special';

/**
 * Timetable feel: a row's height tracks its duration (~1.1px per minute), so a
 * 75-minute block visibly towers over a 35-minute lunch. Clamped so a passing
 * period stays tappable and an all-morning block doesn't swallow the screen.
 */
function rowMinHeight(r: Row): number | undefined {
  if (rowInvalid(r)) return undefined;
  const [sh, sm] = r.start.split(':').map(Number);
  const [eh, em] = r.end.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  // Floor sized so the two stacked 44px time inputs plus the row padding always
  // fit; the per-minute scale is steeper to keep the proportional feel above it.
  return Math.min(Math.max(108, Math.round(mins * 1.5)), 220);
}

/**
 * Borderless inline inputs so the editor reads like the schedule itself. They
 * stay visually light (transparent, no border) but are a real 44px tall —
 * `tap-expand` can't help here because inputs don't render ::after.
 */
const nameCls =
  'h-11 !min-h-0 w-full min-w-0 rounded bg-transparent font-semibold text-[var(--text)] placeholder:font-normal placeholder:text-[var(--muted)]/60 focus:outline-none focus:ring-1 focus:ring-gold';
const timeCls = (bad: boolean) =>
  cx(
    'tnum h-11 !min-h-0 w-[4.9rem] appearance-none rounded bg-transparent p-0 text-xs leading-none focus:outline-none focus:ring-1 focus:ring-gold',
    '[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-date-and-time-value]:text-left',
    bad ? 'text-danger' : 'text-[var(--muted)]',
  );

/** The row's identity picker: which period (or lunch/break/special) this is. */
function LinkSelect({ r, onEdit }: { r: Row; onEdit: (patch: Partial<Row>) => void }) {
  return (
    <select
      value={r.link}
      onChange={(e) => onEdit({ link: e.target.value as RowLink, linkManual: true })}
      aria-label="Linked to"
      className="h-8 !min-h-0 min-w-0 rounded border border-[var(--divider)] bg-transparent px-1 text-xs text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-gold"
    >
      {LINK_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Who attends: FR/SO/JR/SR toggles. All on = everyone; the last one can't turn off. */
function GradeChips({ r, onEdit }: { r: Row; onEdit: (patch: Partial<Row>) => void }) {
  const names: Record<GradeLevel, string> = { 9: 'FR', 10: 'SO', 11: 'JR', 12: 'SR' };
  return (
    <div className="flex gap-1" role="group" aria-label="Grades attending">
      {GRADE_LEVELS.map((g) => {
        const on = r.grades.includes(g);
        return (
          <button
            key={g}
            aria-pressed={on}
            onClick={() => {
              if (on && r.grades.length === 1) return;
              onEdit({ grades: on ? r.grades.filter((x) => x !== g) : [...r.grades, g] });
            }}
            className={cx(
              'h-8 w-8 shrink-0 rounded border text-[11px] font-semibold transition-colors',
              on
                ? 'border-gold bg-gold/15 text-[var(--text)]'
                : 'border-[var(--divider)] text-[var(--muted)]/50',
            )}
          >
            {names[g]}
          </button>
        );
      })}
    </div>
  );
}

/** Typing a name re-links the row ("Period 4" → p4) until the admin picks by hand. */
const labelPatch = (r: Row, label: string): Partial<Row> =>
  r.linkManual ? { label } : { label, link: inferLink(label, r.link) };

function DeleteRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Remove ${label || 'block'}`}
      className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-card text-[var(--muted)]/60 hover:text-danger"
    >
      <XIcon className="h-4 w-4" />
    </button>
  );
}

/** Full-width row, matching BellScheduleView's PeriodRow: stacked times + name. */
function FullRow({
  r,
  onEdit,
  onDelete,
}: {
  r: Row;
  onEdit: (patch: Partial<Row>) => void;
  onDelete: () => void;
}) {
  const bad = rowInvalid(r);
  return (
    <div
      style={{ minHeight: rowMinHeight(r) }}
      className={cx(
        'flex items-center gap-3 px-4 py-2.5',
        rowKind(r) !== 'class' && 'bg-black/[0.02] dark:bg-white/[0.02]',
      )}
    >
      <div className="flex w-24 shrink-0 flex-col">
        <input type="time" value={r.start} onChange={(e) => onEdit({ start: e.target.value })} className={timeCls(bad)} />
        <input type="time" value={r.end} onChange={(e) => onEdit({ end: e.target.value })} className={timeCls(bad)} />
      </div>
      <div className="min-w-0 flex-1">
        <input
          value={r.label}
          onChange={(e) => onEdit(labelPatch(r, e.target.value))}
          placeholder="Period 1, Lunch, Mass…"
          className={nameCls}
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <LinkSelect r={r} onEdit={onEdit} />
          <GradeChips r={r} onEdit={onEdit} />
        </div>
      </div>
      <DeleteRowButton label={r.label} onClick={onDelete} />
    </div>
  );
}

/** One cell of the split grid, matching BellScheduleView's SplitCell. */
function SplitRowCell({
  r,
  first,
  onEdit,
  onDelete,
}: {
  r?: Row;
  first: boolean;
  onEdit: (key: string, patch: Partial<Row>) => void;
  onDelete: (key: string) => void;
}) {
  if (!r) return <div className={cx(!first && 'border-t border-[var(--divider)]')} />;
  const bad = rowInvalid(r);
  return (
    <div
      style={{ minHeight: rowMinHeight(r) }}
      className={cx('min-w-0 px-3 py-3', !first && 'border-t border-[var(--divider)]')}
    >
      <div className="flex items-center gap-1">
        <input type="time" value={r.start} onChange={(e) => onEdit(r.key, { start: e.target.value })} className={timeCls(bad)} />
        <span className="text-xs text-[var(--muted)]">–</span>
        <input type="time" value={r.end} onChange={(e) => onEdit(r.key, { end: e.target.value })} className={timeCls(bad)} />
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <input
          value={r.label}
          onChange={(e) => onEdit(r.key, labelPatch(r, e.target.value))}
          placeholder="Name"
          className={nameCls}
        />
        <DeleteRowButton label={r.label} onClick={() => onDelete(r.key)} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <LinkSelect r={r} onEdit={(p) => onEdit(r.key, p)} />
        <GradeChips r={r} onEdit={(p) => onEdit(r.key, p)} />
      </div>
    </div>
  );
}

/** Keyed by date so every date starts a fresh draft. */
function DayEditor({
  iso,
  dt,
  onDirtyChange,
}: {
  iso: string;
  dt: DateTime;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const edited = useAppStore((s) => s.serverData?.scheduleDays?.[iso]);
  const live = useAppStore((s) => s.liveSchedule[iso]);
  const liveLoaded = useAppStore((s) => s.liveScheduleLoaded);
  const setScheduleDay = useAppStore((s) => s.setScheduleDay);
  const clearScheduleDay = useAppStore((s) => s.clearScheduleDay);
  const dataSyncError = useAppStore((s) => s.dataSyncError);

  // What this date resolves to before any unsaved edits (same layering as the app).
  const saved = useMemo<AdminScheduleDay>(() => {
    if (edited) return edited;
    if (live) return { ...live, dayType: guessDayType(live.short, live.label) ?? undefined };
    // Calendar loaded but no entry ⇒ genuinely not a school day (same contract
    // as resolveSchedule) — start the editor from No School, not Regular.
    if (liveLoaded) return draftDayOf(BELL_SCHEDULES['no-school']);
    return draftDayOf(BELL_SCHEDULES[dayTypeFor(dt)]);
  }, [edited, live, liveLoaded, dt]);

  const [draft, setDraft] = useState<Draft>(() => draftFromDay(saved));
  const [dirty, setDirty] = useState(false);
  // Follow outside changes (a save landing, live data arriving) while clean.
  useEffect(() => {
    if (!dirty) setDraft(draftFromDay(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const invalid = draft.rows.some(rowInvalid);
  const dismissal = draft.rows.length
    ? [...draft.rows].sort((a, b) => (a.end > b.end ? 1 : -1)).at(-1)!.end
    : null;

  // Mirror the dirty flag to the parent: the date picker remounts this editor,
  // so it has to know there is unsaved work before it does.
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setDirty(true);
  };

  const editRow = (key: string, patch: Partial<Row>) =>
    edit((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  const save = () => {
    const periods = draft.rows
      .map(rowToPeriod)
      .sort((a, b) => a.start.localeCompare(b.start));
    setScheduleDay(iso, {
      label: draft.label,
      short: draft.short,
      school: periods.length > 0,
      ...(saved.rotationDay ? { rotationDay: saved.rotationDay } : {}),
      periods,
      ...(draft.dayType ? { dayType: draft.dayType } : {}),
    });
    setDirty(false);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-royal/5 px-4 py-2.5 dark:bg-white/5">
        <span className="min-w-0 truncate font-semibold text-[var(--text)]">{draft.label}</span>
        <Pill tone={edited ? 'gold' : 'royal'}>
          {dirty ? 'Unsaved' : edited ? 'Edited' : live ? 'Live calendar' : 'Default'}
        </Pill>
      </div>

      <div className="space-y-3 p-4">
        {/* Day type stays one tap: picking one loads its blocks into the editor. */}
        <div className="grid grid-cols-2 gap-2">
          {DAY_TYPE_ORDER.map((id) => {
            const active = draft.dayType === id;
            return (
              <button
                key={id}
                onClick={() => {
                  // Re-tapping the day type already loaded would silently
                  // replace every rename, retime and grade chip with the
                  // template's defaults.
                  if (active && !window.confirm('Reset this day to the standard schedule?')) return;
                  edit(() => draftFromTemplate(id));
                }}
                className={cx(
                  'tap rounded-card border px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                  active
                    ? 'border-gold bg-gold/15 text-[var(--text)]'
                    : 'border-[var(--divider)] text-[var(--text)] hover:border-royal',
                )}
              >
                {BELL_SCHEDULES[id].short}
              </button>
            );
          })}
        </div>

        <LunchAssignment draft={draft} edit={edit} />

        {/* The blocks themselves, laid out exactly like the student schedule:
            shared rows full-width, the lunch/grade split as two columns. */}
        {draft.rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-[var(--muted)]">
            No periods — this is a no-school day.
          </p>
        ) : (
          (() => {
            const deleteRow = (key: string) =>
              edit((d) => ({ ...d, rows: d.rows.filter((x) => x.key !== key) }));
            const { pre, headers, pairs, post } = layoutRows(draft.rows);
            return (
              <div className="divide-y divide-[var(--divider)] overflow-hidden rounded-card border border-[var(--divider)]">
                {pre.map((r) => (
                  <FullRow key={r.key} r={r} onEdit={(p) => editRow(r.key, p)} onDelete={() => deleteRow(r.key)} />
                ))}
                {headers && (
                  <div className="bg-black/[0.02] dark:bg-white/[0.02]">
                    <div className="grid grid-cols-2 divide-x divide-[var(--divider)] border-b border-[var(--divider)]">
                      {headers.map((h) => (
                        <div
                          key={h}
                          className="px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"
                        >
                          {h}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-[var(--divider)]">
                      {pairs.map((pair, i) => (
                        <Fragment key={i}>
                          <SplitRowCell r={pair.left} first={i === 0} onEdit={editRow} onDelete={deleteRow} />
                          <SplitRowCell r={pair.right} first={i === 0} onEdit={editRow} onDelete={deleteRow} />
                        </Fragment>
                      ))}
                    </div>
                  </div>
                )}
                {post.map((r) => (
                  <FullRow key={r.key} r={r} onEdit={(p) => editRow(r.key, p)} onDelete={() => deleteRow(r.key)} />
                ))}
              </div>
            );
          })()
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            edit((d) => {
              const last = [...d.rows].sort((a, b) => (a.end > b.end ? 1 : -1)).at(-1);
              const start = last && validTime(last.end) ? last.end : '08:00';
              return {
                ...d,
                rows: [
                  ...d.rows,
                  { key: rowKey(), label: '', start, end: plusMinutes(start, 45), link: 'special' as RowLink, linkManual: false, grades: [...ALL_GRADES], base: null },
                ],
              };
            })
          }
        >
          <span className="flex items-center justify-center gap-1.5">
            <PlusIcon className="h-4 w-4" /> Add a period
          </span>
        </Button>

        {dismissal && (
          <p className="text-sm text-[var(--muted)]">
            Dismissal: <span className="font-semibold text-[var(--text)]">{fmt12(dismissal)}</span>
          </p>
        )}
        {invalid && (
          <p className="text-xs font-semibold text-danger">
            Each period needs a start time before its end time.
          </p>
        )}

        {dirty ? (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={invalid} onClick={save}>
              Save this day
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(draftFromDay(saved));
                setDirty(false);
              }}
            >
              Discard
            </Button>
          </div>
        ) : (
          edited && (
            <Button variant="outline" className="w-full" onClick={() => clearScheduleDay(iso)}>
              Remove edits — back to the calendar
            </Button>
          )
        )}
        {dataSyncError && (
          <p className="text-xs font-semibold text-gold-ink dark:text-gold">
            Saved on this device. It syncs to everyone once you&apos;re signed in with the proxy
            reachable.
          </p>
        )}
      </div>
    </Card>
  );
}

/** A static template as a saveable day shape. */
function draftDayOf(t: (typeof BELL_SCHEDULES)[DayTypeId]): AdminScheduleDay {
  return {
    label: t.name,
    short: t.short,
    school: t.periods.length > 0,
    periods: t.periods,
    dayType: t.id,
  };
}

/**
 * How students find out which lunch is theirs on this day.
 *
 * Almost always it follows the class period next to lunch — the student's
 * building for that period decides it, and the two lunch rows meet everyone.
 * Occasionally a day assigns lunch by class year instead, and then the grade
 * chips on the lunch rows ARE the rule. Making that an explicit choice beats
 * leaving an admin to discover it by toggling chips.
 */
function LunchAssignment({ draft, edit }: { draft: Draft; edit: (fn: (d: Draft) => Draft) => void }) {
  const lunchRows = draft.rows.filter((r) => r.link === 'lunch-first' || r.link === 'lunch-second');
  if (lunchRows.length < 2) return null; // single-lunch day: nothing to decide
  const byGrade = lunchRows.some((r) => r.grades.length < ALL_GRADES.length);

  /** Set the lunch rows' grades; class rows on the same track follow along. */
  const apply = (toGrade: boolean) =>
    edit((d) => ({
      ...d,
      rows: d.rows.map((r) => {
        const track = r.link.endsWith('-first') ? 'first' : r.link.endsWith('-second') ? 'second' : null;
        if (!track) return r;
        if (!toGrade) return { ...r, grades: [...ALL_GRADES] };
        // Default split: underclassmen first, upperclassmen second. Either row's
        // chips can be adjusted afterwards for an unusual arrangement.
        return { ...r, grades: track === 'first' ? [9, 10] : [11, 12] };
      }),
    }));

  return (
    <div className="rounded-card border border-[var(--divider)] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Which lunch a student has
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[
          { on: !byGrade, label: 'By class period', hint: 'Their building decides', to: false },
          { on: byGrade, label: 'By class year', hint: 'Their grade decides', to: true },
        ].map((o) => (
          <button
            key={o.label}
            onClick={() => apply(o.to)}
            className={cx(
              'tap rounded-card border px-3 py-2 text-left transition-colors',
              o.on
                ? 'border-gold bg-gold/15'
                : 'border-[var(--divider)] hover:border-royal',
            )}
          >
            <div className="text-sm font-semibold text-[var(--text)]">{o.label}</div>
            <div className="text-xs text-[var(--muted)]">{o.hint}</div>
          </button>
        ))}
      </div>
      {byGrade && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Adjust the FR/SO/JR/SR chips on the lunch rows below for who eats when.
        </p>
      )}
    </div>
  );
}

/** Calendar-style day picker + the editor for the picked day. */
function DayScheduleSection() {
  const today = nowInSchoolTz().startOf('day');
  const [selected, setSelected] = useState<DateTime>(() => today);
  const [pickerOpen, setPickerOpen] = useState(false);
  const iso = selected.toFormat('yyyy-MM-dd');
  // The editor is keyed by date, so changing dates REMOUNTS it and any unsaved
  // draft dies with it. Ask first rather than silently discarding the work.
  const dirtyRef = useRef(false);
  const selectDay = (d: DateTime) => {
    if (dirtyRef.current && !window.confirm('Discard the unsaved changes to this day?')) return;
    dirtyRef.current = false;
    setSelected(d);
  };
  // Dot the month grid on every edited day, and re-dim on live-schedule load.
  const scheduleDays = useAppStore((s) => s.serverData?.scheduleDays);
  useAppStore((s) => s.liveScheduleLoaded);
  const editedDates = useMemo(() => new Set(Object.keys(scheduleDays ?? {})), [scheduleDays]);

  return (
    <section className="space-y-2">
      <SectionTitle>Day schedule</SectionTitle>

      <DayStepper
        selected={selected}
        today={today}
        onSelect={selectDay}
        eventDates={editedDates}
      />

      <DayEditor key={iso} iso={iso} dt={selected} onDirtyChange={(d) => (dirtyRef.current = d)} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Events (unchanged from the previous page).
// ---------------------------------------------------------------------------

function AddEventForm() {
  const addEvent = useAppStore((s) => s.addEvent);
  const [date, setDate] = useState(() => nowInSchoolTz().toFormat('yyyy-MM-dd'));
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SchoolEvent['category']>('campus-life');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  return (
    <section className="space-y-2">
      <SectionTitle>New event</SectionTitle>
      <Card className="space-y-3 p-4">
        <Field label="Title">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring Concert" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as SchoolEvent['category'])}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace('-', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time (optional)">
            <TextInput value={time} onChange={(e) => setTime(e.target.value)} placeholder="7:00 PM" />
          </Field>
          <Field label="Location (optional)">
            <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Gym" />
          </Field>
        </div>
        <Button
          className="w-full"
          disabled={!title.trim() || !date}
          onClick={() => {
            addEvent({
              date,
              title: title.trim(),
              category,
              time: time.trim() || undefined,
              location: location.trim() || undefined,
            });
            setTitle('');
            setTime('');
            setLocation('');
          }}
        >
          Add event
        </Button>
      </Card>
    </section>
  );
}

/** Inline editor for a posted event: everything the add form asks for. */
function EventEditor({ e, onDone }: { e: SchoolEvent; onDone: () => void }) {
  const updateEvent = useAppStore((s) => s.updateEvent);
  const [title, setTitle] = useState(e.title);
  const [date, setDate] = useState(e.date);
  const [category, setCategory] = useState<SchoolEvent['category']>(e.category);
  const [time, setTime] = useState(e.time ?? '');
  const [location, setLocation] = useState(e.location ?? '');

  return (
    <div className="space-y-3 border-t border-[var(--divider)] bg-black/[0.02] px-4 py-4 dark:bg-white/[0.02]">
      <Field label="Title">
        <TextInput value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder={e.title} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <TextInput type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(ev) => setCategory(ev.target.value as SchoolEvent['category'])}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace('-', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time (optional)">
          <TextInput value={time} onChange={(ev) => setTime(ev.target.value)} placeholder="7:00 PM" />
        </Field>
        <Field label="Location (optional)">
          <TextInput value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="Gym" />
        </Field>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1"
          disabled={!title.trim() || !date}
          onClick={() => {
            updateEvent(e.id, {
              title: title.trim(),
              date,
              category,
              time: time.trim() || undefined,
              location: location.trim() || undefined,
            });
            onDone();
          }}
        >
          Save changes
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** A posted event: edit it, hide it from the app, or delete it outright. */
function EventRow({ e }: { e: SchoolEvent }) {
  const deleteEvent = useAppStore((s) => s.deleteEvent);
  const setHidden = useAppStore((s) => s.setEventHidden);
  const [editing, setEditing] = useState(false);
  const hidden = Boolean(e.hidden);

  return (
    <div>
      <div className={cx('flex items-start gap-3 px-4 py-3', hidden && 'opacity-60')}>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[var(--text)]">{e.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <Pill tone="muted">{e.category.replace('-', ' ')}</Pill>
            <span>{formatDayLabel(DateTime.fromISO(e.date))}</span>
            {e.time && <span>· {e.time}</span>}
            {hidden && <Pill tone="muted">Hidden</Pill>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'Close' : 'Edit'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHidden(e.id, !hidden)}
          >
            {hidden ? 'Restore' : 'Hide'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => deleteEvent(e.id)}>
            Delete
          </Button>
        </div>
      </div>
      {editing && <EventEditor e={e} onDone={() => setEditing(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live calendar events: the school's own Master Calendar feed. They can't be
// deleted (the feed would resend them), so an admin renames, retimes, or hides
// them — the same shared eventEdits the athletics editor writes.
// ---------------------------------------------------------------------------

function LiveEventEditor({ e, onDone }: { e: SchoolEvent; onDone: () => void }) {
  const updateAthleticsEvent = useAppStore((s) => s.updateAthleticsEvent);
  const [title, setTitle] = useState(e.title);
  const [time, setTime] = useState(e.time ?? '');
  const [location, setLocation] = useState(e.location ?? '');

  return (
    <div className="space-y-3 border-t border-[var(--divider)] bg-black/[0.02] px-4 py-4 dark:bg-white/[0.02]">
      <Field label="Event name">
        <TextInput value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder={e.title} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Time">
          <TextInput value={time} onChange={(ev) => setTime(ev.target.value)} placeholder="7:00 PM" />
        </Field>
        <Field label="Location">
          <TextInput value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="Gym" />
        </Field>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1"
          onClick={() => {
            // Blank fields fall back to the feed's own values.
            updateAthleticsEvent(e.id, {
              title: title.trim(),
              time: time.trim(),
              location: location.trim(),
            });
            onDone();
          }}
        >
          Save changes
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LiveEventsSection() {
  const mounted = useMounted();
  const serverData = useAppStore((s) => s.serverData);
  const updateAthleticsEvent = useAppStore((s) => s.updateAthleticsEvent);
  const todayIso = nowInSchoolTz().toFormat('yyyy-MM-dd');
  const [live, setLive] = useState<SchoolEvent[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchLiveEvents().then((evts) => alive && setLive(evts ?? []));
    return () => {
      alive = false;
    };
  }, [mounted]);

  // Hidden events stay listed here, greyed out, so they can be restored.
  const upcoming = applyAthleticsEdits(live ?? [], serverData, { includeHidden: true })
    .filter((e) => (e.endDate ?? e.date) >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 60);

  return (
    <section className="space-y-2">
      <SectionTitle>Live calendar events</SectionTitle>
      {live === null ? (
        <Spinner label="Loading the live calendar…" />
      ) : upcoming.length === 0 ? (
        // An unreachable feed is a notice, not an empty state.
        live.length === 0 ? (
          <Card className="border-gold/40 bg-gold/10 p-3 text-xs text-[var(--muted)]">
            The live calendar isn&rsquo;t reachable right now.
          </Card>
        ) : (
          <EmptyState title="No upcoming events" />
        )
      ) : (
        <Card className="divide-y divide-[var(--divider)]">
          {upcoming.map((e) => {
            const hidden = Boolean(e.hidden);
            const isEditing = editing === e.id;
            return (
              <div key={e.id}>
                <div className={cx('flex items-start gap-3 px-4 py-3', hidden && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--text)]">{e.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <Pill tone="muted">{e.category.replace('-', ' ')}</Pill>
                      <span>{formatDayLabel(DateTime.fromISO(e.date))}</span>
                      {e.time && <span>· {e.time}</span>}
                      {e.location && <span>· {e.location}</span>}
                      {hidden && <Pill tone="muted">Hidden</Pill>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(isEditing ? null : e.id)}
                    >
                      {isEditing ? 'Close' : 'Edit'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateAthleticsEvent(e.id, { hidden: !hidden })}
                    >
                      {hidden ? 'Restore' : 'Hide'}
                    </Button>
                  </div>
                </div>
                {isEditing && <LiveEventEditor e={e} onDone={() => setEditing(null)} />}
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}

export default function AdminSchedulePage() {
  const adminEvents = useAppStore((s) => s.serverData?.events ?? []);
  const sortedAdmin = [...adminEvents].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <AdminGate title="Schedule & Events">
      <DayScheduleSection />
      <AddEventForm />

      {sortedAdmin.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Your events</SectionTitle>
          <Card className="divide-y divide-[var(--divider)]">
            {sortedAdmin.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </Card>
        </section>
      )}

      <LiveEventsSection />
    </AdminGate>
  );
}
