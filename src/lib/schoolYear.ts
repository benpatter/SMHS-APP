/** Determines the current school year start (the August the year began). */
import { nowInSchoolTz, DateTime } from './time';

/** The month (1-based) the school year rolls over: June 1. */
export const SCHOOL_YEAR_ROLLOVER_MONTH = 6;

/** The calendar year of the August the current school year started in. */
export function currentSchoolYearStart(now: DateTime = nowInSchoolTz()): number {
  // The year rolls over on June 1: school has let out, so students are their
  // NEXT grade (a rising senior is already a senior) and the graduating class
  // is gone. So Jun–Dec belong to the year that just/newly started; Jan–May to
  // the prior one.
  return now.month >= SCHOOL_YEAR_ROLLOVER_MONTH ? now.year : now.year - 1;
}

/** The current school year written the way the school writes it: "2026–27". */
export function schoolYearLabel(now: DateTime = nowInSchoolTz()): string {
  const start = currentSchoolYearStart(now);
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Graduation years to offer in onboarding (current seniors → incoming frosh). */
export function gradYearOptions(now: DateTime = nowInSchoolTz()): number[] {
  const start = currentSchoolYearStart(now);
  // Seniors graduate start+1; current frosh graduate start+4.
  return [start + 1, start + 2, start + 3, start + 4];
}
