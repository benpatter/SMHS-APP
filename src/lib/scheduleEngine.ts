/**
 * The schedule engine: the soul of the app. Pure, on-device, timezone-correct.
 * Given a moment and the student's personalization, it answers:
 *   "what period am I in, how long is left, and what's next?"
 *
 * No network, no surprises: fully deterministic from (now, config, profile).
 */
import { BellPeriod, BellSchedule, DayTypeId, GradeGroup } from '@/config/bellSchedules';
import { lunchForBuilding } from '@/config/buildings';
import { scheduleFor, dayTypeFor } from './calendar';
import { atTime, DateTime, isoDate, nowInSchoolTz } from './time';
import type { LunchTrack, PersonalSchedule } from './types';

export type EngineStatus =
  | 'no-school'
  | 'before-school'
  | 'in-period'
  | 'passing'
  | 'after-school';

export interface PeriodView {
  period: BellPeriod;
  /** Personalized name or the default "Period N" / break label. */
  displayName: string;
  room?: string;
  building?: string;
  teacher?: string;
  /** Extra detail line (e.g. the split-mass attendance nuance). */
  note?: string;
  free: boolean;
  start: DateTime;
  end: DateTime;
}

export interface EngineState {
  now: DateTime;
  isoDay: string;
  dayType: DayTypeId;
  schedule: BellSchedule;
  status: EngineStatus;
  /** All meeting periods today, personalized, honoring the period-8 toggle. */
  periodsToday: PeriodView[];
  /** The period happening right now (in-period only). */
  current?: PeriodView;
  /** The next class to be in (skips free periods); used for "what's next". */
  nextClass?: PeriodView;
  /** The next period boundary we are counting toward (any kind). */
  nextPeriod?: PeriodView;
  /** Primary hero countdown, in seconds. */
  secondsRemaining: number;
  countdownTarget: 'period-end' | 'next-start' | 'school-start' | 'school-out' | 'none';
  /** End of the last meeting period today. */
  schoolOutAt?: DateTime;
  secondsToSchoolOut?: number;
}

function personalize(p: BellPeriod, personal: PersonalSchedule): PeriodView {
  const pc = p.periodNumber ? personal[p.periodNumber] : undefined;
  const free = !!pc?.free;
  let displayName = p.label;
  if (p.kind === 'class' && pc?.name) displayName = pc.name;
  if (p.kind === 'class' && free) displayName = pc?.name ? `${pc.name} (Free)` : 'Free Period';
  return {
    period: p,
    displayName,
    room: p.kind === 'class' ? pc?.room : undefined,
    building: p.kind === 'class' ? pc?.building : undefined,
    teacher: p.kind === 'class' ? pc?.teacher : undefined,
    note: p.note,
    free,
    // start/end filled by builder (needs the date)
    start: undefined as unknown as DateTime,
    end: undefined as unknown as DateTime,
  };
}

/** Everything the UI needs to explain a student's lunch for a given day. */
export interface LunchInfo {
  /** True when the day splits into first/second lunch (periods carry tracks). */
  dual: boolean;
  /**
   * What decides which lunch a student has, for THIS day. Normally their class
   * period's building; a day can instead assign lunch by grade level (the
   * lunch periods carry `grades`), e.g. underclassmen eat first that day.
   */
  by: 'building' | 'grade';
  /**
   * The block whose building decides lunch: the class block adjacent to lunch
   * that splits into first/second copies. That's Period 3 on a Regular day,
   * Period 2 on a Meeting day, Period 4 on an All-Periods day. Null on
   * single-lunch days and on grade-decided days.
   */
  decidingPeriod: number | null;
  /** The building the student set for the deciding block, if any. */
  building: string | null;
  /** The resolved lunch track, or null when unknown (no building / no class year). */
  track: LunchTrack | null;
}

/** Does this day hand lunch out by grade level rather than by building? */
function lunchIsByGrade(schedule: BellSchedule): boolean {
  return schedule.periods.some((p) => p.kind === 'lunch' && p.track && p.grades?.length);
}

/**
 * Resolve a student's lunch for a day.
 *
 * Normally it comes from the building of the day's deciding block — the class
 * block adjacent to lunch that splits into first/second copies (Period 3 on a
 * Regular day, Period 2 on a Meeting day, Period 4 on an All-Periods day).
 *
 * A day can instead assign lunch BY GRADE, by putting grade levels on its lunch
 * periods; then the student's class year decides and buildings are irrelevant.
 * `track` is null when whichever input is needed hasn't been set, and callers
 * show both lunches.
 */
export function lunchInfoForDay(
  schedule: BellSchedule,
  personal: PersonalSchedule,
  grade: number | null = null,
): LunchInfo {
  const lunches = schedule.periods.filter((p) => p.kind === 'lunch' && p.track);
  if (lunchIsByGrade(schedule)) {
    const mine = grade == null ? undefined : lunches.find((p) => (p.grades as number[] | undefined)?.includes(grade));
    return {
      dual: lunches.length > 1,
      by: 'grade',
      decidingPeriod: null,
      building: null,
      track: mine?.track ?? null,
    };
  }
  // The lunch split lives on exactly one class block (its first/second copies);
  // your building for that block is what decides your lunch.
  const decidingPeriod =
    schedule.periods.find((p) => p.kind === 'class' && p.track && p.periodNumber)?.periodNumber ??
    null;
  const dual = decidingPeriod !== null;
  const deciding = decidingPeriod ? personal[decidingPeriod] : undefined;
  const building = deciding?.building ?? null;
  // Science classes always eat first lunch regardless of building: the science
  // flag overrides the building when resolving the track. (A free deciding block
  // isn't a real class, so a stale science flag on it doesn't apply.)
  //
  // A hand-set lunch on the deciding block beats both. The chart is right almost
  // always, but "almost" is why the override exists: a class that eats with the
  // other group has no other way to say so, and the student knows which line
  // they stand in better than a building letter does.
  const override = deciding?.free ? undefined : deciding?.lunch;
  const track = !dual
    ? null
    : (override ??
      (deciding?.science && !deciding?.free ? 'first' : lunchForBuilding(building)));
  return { dual, by: 'building', decidingPeriod, building, track };
}

/** A student's lunch track for a day, or null when unknown/single-lunch. */
export function lunchForDay(
  schedule: BellSchedule,
  personal: PersonalSchedule,
  grade: number | null = null,
): LunchTrack | null {
  return lunchInfoForDay(schedule, personal, grade).track;
}

/**
 * Build today's personalized, time-resolved period list. On dual-lunch days,
 * keeps only the periods matching the student's lunch track (untracked periods
 * meet for everyone), then sorts chronologically. A null lunch means the track
 * is unknown (no 3rd-period building set). Both lunches are kept so the student
 * sees both options.
 */
export function buildPeriodsToday(
  schedule: BellSchedule,
  isoDay: string,
  personal: PersonalSchedule,
  lunch: LunchTrack | null,
  group: GradeGroup | null = null,
  grade: number | null = null,
): PeriodView[] {
  return schedule.periods
    .filter((p) => !p.track || lunch === null || p.track === lunch)
    .filter((p) => !p.group || group === null || p.group === group)
    // Grade-limited periods (a Fr/So Mass, a senior meeting) drop from other
    // grades' timelines; an unset grade shows everything, badged in the UI.
    .filter((p) => !p.grades || grade === null || (p.grades as number[]).includes(grade))
    .map((p) => {
      const v = personalize(p, personal);
      v.start = atTime(isoDay, p.start);
      v.end = atTime(isoDay, p.end);
      return v;
    })
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

/**
 * A two-lunch day laid out for the "no building set" view: the shared periods
 * bookending lunch stay full-width, and the lunch-divergent middle splits into
 * two parallel columns, one per lunch track, so the student sees both options
 * side by side. Returned only for dual-lunch days; null otherwise.
 *
 * `rows` pairs the two tracks by chronological position. For a Regular day that
 * yields:
 *   row 0: First Lunch     | Block 3 (2nd)
 *   row 1: Block 3 (1st)   | Second Lunch
 */
export interface SplitLunchLayout {
  /** Shared periods before lunch splits (full-width). */
  pre: PeriodView[];
  /** Paired track cells: `first` is the 1st-lunch column, `second` the 2nd. */
  rows: { first: PeriodView; second: PeriodView }[];
  /** Shared periods after lunch rejoins (full-width). */
  post: PeriodView[];
}

/**
 * Partition a chronological period list (built with a null lunch, so both tracks
 * are present) into a `SplitLunchLayout`. Returns null when the day carries no
 * lunch tracks (single-lunch or no-school), so callers fall back to a flat list.
 */
export function splitLunchLayout(periods: PeriodView[]): SplitLunchLayout | null {
  const tracked = periods.filter((p) => p.period.track);
  if (tracked.length === 0) return null;

  const splitStart = Math.min(...tracked.map((p) => p.start.toMillis()));

  // Partition on one boundary so EVERY untracked period lands somewhere. Using
  // `end <= splitStart` for pre and `start >= splitEnd` for post left anything
  // overlapping the split window in neither list, silently dropping it from the
  // student's schedule while the countdown still counted toward it.
  const shared = periods.filter((p) => !p.period.track);
  const pre = shared.filter((p) => p.start.toMillis() < splitStart);
  const post = shared.filter((p) => p.start.toMillis() >= splitStart);

  const byStart = (a: PeriodView, b: PeriodView) => a.start.toMillis() - b.start.toMillis();
  const first = periods.filter((p) => p.period.track === 'first').sort(byStart);
  const second = periods.filter((p) => p.period.track === 'second').sort(byStart);

  // The two columns exist to show a student BOTH options. If only one survives
  // filtering — their grade isn't in the other lunch, say — a side-by-side with
  // an empty column under a header explains nothing. Fall back to a flat list,
  // which is exactly what that student's day is.
  if (first.length === 0 || second.length === 0) return null;

  const rows = Array.from({ length: Math.max(first.length, second.length) }, (_, i) => ({
    first: first[i],
    second: second[i],
  }));

  return { pre, rows, post };
}

/**
 * A split-mass day laid out for the schedule view: the shared periods bookending
 * the Mass window stay full-width, and the grade-divergent middle splits into two
 * parallel columns, Jr/Sr and Fr/So, so a student sees both. Returned only for
 * split-mass days (periods carry a `group`); null otherwise.
 *
 * `rows` pairs the two groups by chronological position. For a Split Mass day:
 *   row 0: Mass (Jr/Sr, attendance first)  | Period Y (Fr/So)
 *   row 1: Period Y (Jr/Sr)                | Mass (Fr/So)
 */
export interface SplitMassLayout {
  /** Shared periods before the Mass window (full-width). */
  pre: PeriodView[];
  /** Paired grade cells: `jrsr` is the Jr/Sr column, `frso` the Fr/So column. */
  rows: { jrsr?: PeriodView; frso?: PeriodView }[];
  /** Shared periods after the Mass window (full-width). */
  post: PeriodView[];
}

/**
 * Partition a chronological period list (built with a null group, so both grades
 * are present) into a `SplitMassLayout`. Returns null when the day carries no
 * grade groups, so callers fall back to the flat/lunch layouts.
 */
export function splitMassLayout(periods: PeriodView[]): SplitMassLayout | null {
  const grouped = periods.filter((p) => p.period.group);
  if (grouped.length === 0) return null;

  const splitStart = Math.min(...grouped.map((p) => p.start.toMillis()));

  // Same one-boundary partition as splitLunchLayout: nothing may fall through.
  const shared = periods.filter((p) => !p.period.group);
  const pre = shared.filter((p) => p.start.toMillis() < splitStart);
  const post = shared.filter((p) => p.start.toMillis() >= splitStart);

  const byStart = (a: PeriodView, b: PeriodView) => a.start.toMillis() - b.start.toMillis();
  const jrsr = periods.filter((p) => p.period.group === 'jrsr').sort(byStart);
  const frso = periods.filter((p) => p.period.group === 'frso').sort(byStart);

  // One surviving column is a flat day, not a comparison (see splitLunchLayout).
  if (jrsr.length === 0 || frso.length === 0) return null;

  const rows = Array.from({ length: Math.max(jrsr.length, frso.length) }, (_, i) => ({
    jrsr: jrsr[i],
    frso: frso[i],
  }));

  return { pre, rows, post };
}

export interface ComputeOptions {
  now?: DateTime;
  personal?: PersonalSchedule;
  /** Student's grade group; picks their timeline on split-mass days. */
  group?: GradeGroup | null;
  /** Student's grade level (9–12); drops grade-limited periods that aren't theirs. */
  grade?: number | null;
}

export function computeState(opts: ComputeOptions = {}): EngineState {
  const now = opts.now ?? nowInSchoolTz();
  const personal = opts.personal ?? {};

  const isoDay = isoDate(now);
  const dayType = dayTypeFor(now);
  const schedule = scheduleFor(now);
  // Lunch comes from the 3rd-period building of this day; the single-timeline
  // countdown needs one track, so fall back to first lunch when unknown.
  const lunch = lunchForDay(schedule, personal, opts.grade ?? null) ?? 'first';
  // Split-mass days diverge by grade; the countdown follows the student's grade
  // group, falling back to Fr/So when it's unknown so the timeline never overlaps.
  // No class year set means we genuinely don't know which grade timeline is
  // theirs. Defaulting to Fr/So silently hid every Jr/Sr period from the hero
  // while the schedule card below it showed both; null keeps them consistent.
  const group = opts.group ?? null;
  const periodsToday = buildPeriodsToday(schedule, isoDay, personal, lunch, group, opts.grade ?? null);

  const schoolOutAt = periodsToday.length ? periodsToday[periodsToday.length - 1].end : undefined;
  const secondsToSchoolOut = schoolOutAt
    ? Math.max(0, schoolOutAt.diff(now, 'seconds').seconds)
    : undefined;

  const base: EngineState = {
    now,
    isoDay,
    dayType,
    schedule,
    status: 'no-school',
    periodsToday,
    secondsRemaining: 0,
    countdownTarget: 'none',
    schoolOutAt,
    secondsToSchoolOut,
  };

  if (periodsToday.length === 0) {
    return { ...base, status: 'no-school' };
  }

  const nextClassAfter = (idx: number): PeriodView | undefined =>
    periodsToday.slice(idx).find((p) => p.period.kind === 'class' && !p.free);

  // Before first period.
  const first = periodsToday[0];
  if (now < first.start) {
    return {
      ...base,
      status: 'before-school',
      nextPeriod: first,
      nextClass: nextClassAfter(0),
      secondsRemaining: Math.max(0, first.start.diff(now, 'seconds').seconds),
      countdownTarget: 'school-start',
    };
  }

  // After last period.
  const last = periodsToday[periodsToday.length - 1];
  if (now >= last.end) {
    return { ...base, status: 'after-school', countdownTarget: 'none', secondsRemaining: 0 };
  }

  // In a period?
  const currentIdx = periodsToday.findIndex((p) => now >= p.start && now < p.end);
  if (currentIdx >= 0) {
    const current = periodsToday[currentIdx];
    return {
      ...base,
      status: 'in-period',
      current,
      nextPeriod: periodsToday[currentIdx + 1],
      nextClass: nextClassAfter(currentIdx + 1),
      secondsRemaining: Math.max(0, current.end.diff(now, 'seconds').seconds),
      countdownTarget: 'period-end',
    };
  }

  // Otherwise: passing period (gap between two periods).
  const nextIdx = periodsToday.findIndex((p) => now < p.start);
  const nextPeriod = periodsToday[nextIdx];
  return {
    ...base,
    status: 'passing',
    nextPeriod,
    nextClass: nextClassAfter(nextIdx),
    secondsRemaining: Math.max(0, nextPeriod.start.diff(now, 'seconds').seconds),
    countdownTarget: 'next-start',
  };
}
