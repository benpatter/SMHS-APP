/**
 * Bell schedules: the REAL SMCHS 2026-2027 schedule, transcribed from the
 * school's published "2026-2027 Bell Schedules" PDF (smhs.org → Parents → Bell
 * Schedules). Times are local (America/Los_Angeles) "HH:mm"; the engine
 * interprets them in the school timezone.
 *
 * Key facts about the real schedule:
 *  - It's a ROTATING BLOCK schedule: classes are "Block 1"–"Block 7" and the
 *    blocks rotate. Which of a student's classes meets in a given block is set
 *    per-day by the Master Calendar rotation. There is NO Period 8.
 *  - DUAL LUNCH: most days have a First and Second lunch (assigned by building).
 *    Periods carry an optional `track` ('first' | 'second'); a period with no
 *    track meets for everyone, and the engine keeps only the periods matching the
 *    student's lunch track.
 *  - `periodNumber` (1–7) is the block index, the join key to a student's named
 *    blocks. (Mapping a block to the student's actual class on rotation days is a
 *    later step that needs the Master Calendar rotation feed.)
 *
 * "Meeting" (8:00–8:55 on Meeting/Rally days) is a faculty meeting. Students
 * start at Block 1. It's shown so the bell schedule mirrors the official one.
 */

export type DayTypeId =
  | 'regular'
  | 'all-periods'
  | 'meeting'
  | 'mass'
  | 'minimum'
  | 'rally'
  | 'split-mass'
  | 'no-school';

export type PeriodKind = 'class' | 'break' | 'lunch' | 'special';

/** Which lunch track a period belongs to. Undefined = meets for everyone. */
export type LunchTrack = 'first' | 'second';

/**
 * Grade-split group for split-mass days (Juniors/Seniors vs Freshmen/Sophomores).
 * Undefined = the period meets for everyone.
 */
export type GradeGroup = 'jrsr' | 'frso';

/** A grade level: 9 = freshmen … 12 = seniors. */
export type GradeLevel = 9 | 10 | 11 | 12;

export const GRADE_LEVELS: GradeLevel[] = [9, 10, 11, 12];

/** Short badge for a grade subset: [9,10] → "Fr/So". */
export function gradesLabel(grades: GradeLevel[]): string {
  const short: Record<GradeLevel, string> = { 9: 'Fr', 10: 'So', 11: 'Jr', 12: 'Sr' };
  return grades.map((g) => short[g]).join('/');
}

export interface BellPeriod {
  id: string;
  label: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  kind: PeriodKind;
  periodNumber?: number; // 1–7 for class blocks
  /** Only shown to students on this lunch track; undefined = everyone. */
  track?: LunchTrack;
  /** Only for this grade group on split-mass days; undefined = everyone. */
  group?: GradeGroup;
  /**
   * Only these grade levels attend (a grade-split Mass, a class meeting in the
   * gym…); undefined = everyone. Set per-day by the admin schedule editor.
   */
  grades?: GradeLevel[];
  /** Extra detail shown under the period, e.g. "Period 4 attendance at 9:25". */
  note?: string;
}

export interface BellSchedule {
  id: DayTypeId;
  name: string;
  short: string;
  description: string;
  /** May include both lunch tracks; the engine filters to the student's track. */
  periods: BellPeriod[];
}

/** Class block. `track` set only for the lunch-divergent copies of a block. */
const blk = (n: number, start: string, end: string, track?: LunchTrack): BellPeriod => ({
  id: track ? `b${n}-${track}` : `b${n}`,
  label: `Period ${n}`,
  start,
  end,
  kind: 'class',
  periodNumber: n,
  ...(track ? { track } : {}),
});

/** Lunch period (optionally track-specific). */
const lunch = (start: string, end: string, track?: LunchTrack): BellPeriod => ({
  id: track ? `lunch-${track}` : 'lunch',
  label: track === 'first' ? 'First Lunch' : track === 'second' ? 'Second Lunch' : 'Lunch',
  start,
  end,
  kind: 'lunch',
  ...(track ? { track } : {}),
});

/** Non-class special block (mass, rally, faculty meeting). */
const special = (id: string, label: string, start: string, end: string): BellPeriod => ({
  id,
  label,
  start,
  end,
  kind: 'special',
});

export const BELL_SCHEDULES: Record<DayTypeId, BellSchedule> = {
  regular: {
    id: 'regular',
    name: 'Regular Day',
    short: 'Regular',
    description: '75-minute classes with a nutrition break and two lunches.',
    periods: [
      blk(1, '08:00', '09:15'),
      blk(2, '09:20', '10:40'),
      // First-lunch track
      lunch('10:40', '11:15', 'first'),
      blk(3, '11:20', '12:35', 'first'),
      // Second-lunch track
      blk(3, '10:45', '12:00', 'second'),
      lunch('12:00', '12:35', 'second'),
      blk(4, '12:40', '13:55'),
    ],
  },

  'all-periods': {
    id: 'all-periods',
    name: 'All Periods Day',
    short: 'All Periods',
    description: 'Shorter 45-minute classes. All seven periods meet today.',
    periods: [
      blk(1, '08:00', '08:45'),
      blk(2, '08:50', '09:40'),
      blk(3, '09:50', '10:35'),
      // First-lunch track
      lunch('10:35', '11:10', 'first'),
      blk(4, '11:15', '12:00', 'first'),
      // Second-lunch track
      blk(4, '10:40', '11:25', 'second'),
      lunch('11:25', '12:00', 'second'),
      blk(5, '12:05', '12:50'),
      blk(6, '12:55', '13:40'),
      blk(7, '13:45', '14:30'),
    ],
  },

  meeting: {
    id: 'meeting',
    name: 'Meeting Day',
    short: 'Meeting',
    description: 'Faculty meeting first; classes begin at Period 1 (9:00 AM).',
    periods: [
      special('meeting', 'Staff Meeting', '08:00', '08:55'),
      blk(1, '09:00', '10:20'),
      // First-lunch track
      lunch('10:20', '10:55', 'first'),
      blk(2, '11:00', '12:15', 'first'),
      // Second-lunch track
      blk(2, '10:25', '11:40', 'second'),
      lunch('11:40', '12:15', 'second'),
      blk(3, '12:20', '13:35'),
    ],
  },

  mass: {
    id: 'mass',
    name: 'Mass Day',
    short: 'Mass',
    description: 'All-school Mass after Period 1, then two lunches.',
    periods: [
      blk(1, '08:00', '09:20'),
      special('mass', 'Mass', '09:25', '10:55'),
      // First-lunch track
      lunch('10:55', '11:30', 'first'),
      blk(2, '11:35', '12:50', 'first'),
      // Second-lunch track
      blk(2, '11:00', '12:15', 'second'),
      lunch('12:15', '12:50', 'second'),
      blk(3, '12:55', '14:10'),
    ],
  },

  minimum: {
    id: 'minimum',
    name: 'Minimum Day',
    short: 'Minimum',
    description: 'Shortened day: three periods, early dismissal, no lunch.',
    periods: [
      blk(1, '08:00', '09:15'),
      blk(2, '09:20', '10:40'),
      blk(3, '10:45', '12:00'),
    ],
  },

  rally: {
    id: 'rally',
    name: 'Rally / Assembly',
    short: 'Rally',
    description: 'All-school rally before a single lunch.',
    periods: [
      special('meeting', 'Staff Meeting', '08:00', '08:55'),
      blk(1, '09:00', '10:20'),
      special('rally', 'Rally / Assembly', '10:25', '11:15'),
      lunch('11:15', '11:55'),
      blk(2, '12:00', '13:15'),
      blk(3, '13:20', '14:35'),
    ],
  },

  'split-mass': {
    id: 'split-mass',
    name: 'Split Mass Day',
    short: 'Split Mass',
    description: 'Mass split by grade level during the Period 2 window.',
    periods: [
      blk(1, '08:00', '09:20'),
      special('mass-block', 'Mass & Period 2', '09:25', '12:05'),
      lunch('12:05', '12:45'),
      blk(3, '12:50', '14:05'),
    ],
  },

  'no-school': {
    id: 'no-school',
    name: 'No School',
    short: 'No School',
    description: 'No classes today.',
    periods: [],
  },
};

export const DAY_TYPE_ORDER: DayTypeId[] = [
  'regular',
  'all-periods',
  'meeting',
  'mass',
  'minimum',
  'rally',
  'split-mass',
  'no-school',
];
