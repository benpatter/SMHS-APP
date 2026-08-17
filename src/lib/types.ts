/** Shared domain types used across the store, engine, and UI. */
import type { BellPeriod, DayTypeId } from '@/config/bellSchedules';

/** Which lunch a student has (assigned by building). Drives the dual-lunch days. */
export type LunchTrack = 'first' | 'second';

/**
 * One real school day from the school's Master Calendar (via the live proxy):
 * its day type, rotation day, and the exact rotated periods/times. `periods` is
 * empty for holidays (school === false).
 */
export interface LiveDay {
  label: string;
  short: string;
  school: boolean;
  rotationDay?: number;
  periods: BellPeriod[];
}

/**
 * An admin-edited school day: a full replacement schedule for one date (blocks
 * renamed, times shifted, periods added/removed). Server-owned so every device
 * sees the change; wins over the live calendar for that date. `dayType` keeps
 * the "what kind of day is this" tag the editor started from.
 */
export interface AdminScheduleDay extends LiveDay {
  dayType?: DayTypeId;
}

/** A student's personalization for one block (1–7). All optional. */
export interface PersonalClass {
  /** Custom name, e.g. "AP Bio". Falls back to "Block N" when empty. */
  name?: string;
  room?: string;
  /** Building letter (A, B, C, G, S, T, R). */
  building?: string;
  teacher?: string;
  /** Marked as a free period / off. The countdown treats it as free time. */
  free?: boolean;
  /**
   * Marked as a science class. Science classes always eat first lunch regardless
   * of building, so this overrides the building when resolving the lunch track.
   */
  science?: boolean;
}

export type PersonalSchedule = Record<number, PersonalClass>;

export interface Profile {
  gradYear: number | null;
  name: string;
  /** School email. Must be on the student domain to access the student app. */
  email: string;
  onboarded: boolean;
}

/** Students sign in with a school email on this domain. Nothing else gets in. */
export const STUDENT_EMAIL_DOMAIN = '@smhsstudents.org';

export function isStudentEmail(email: string): boolean {
  return /^[^\s@]+@smhsstudents\.org$/i.test(email.trim());
}

/**
 * Possessive schedule label for the parent view: "Marcus" → "Marcus' Schedule",
 * "Ben" → "Ben's Schedule", unnamed → "Child's Schedule".
 */
export function childScheduleLabel(name: string | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return "Child's Schedule";
  return /s$/i.test(n) ? `${n}' Schedule` : `${n}'s Schedule`;
}

/** Grade level (9–12) derived from graduation year + current school year. */
export function gradeFromGradYear(gradYear: number | null, refYearStart: number): number | null {
  if (!gradYear) return null;
  // School year that started in August `refYearStart` graduates seniors in `refYearStart + 1`.
  const grade = 12 - (gradYear - (refYearStart + 1));
  return grade >= 9 && grade <= 12 ? grade : null;
}
