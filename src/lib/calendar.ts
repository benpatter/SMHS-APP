/** Resolves any date to its schedule/day type and surfaces events.
 *
 * Layered sources, most-authoritative first:
 *   1. Admin-edited day (server-owned, all devices): a full replacement
 *      schedule saved in the Schedule editor — renamed blocks, shifted times.
 *   2. Live per-date schedule from the school's Master Calendar (real rotation).
 *   3. Honest "unavailable" state when the live calendar has never loaded —
 *      the app never invents a school day it can't verify.
 */
import { DAY_TYPE_OVERRIDES, SCHOOL_EVENTS, type SchoolEvent } from '@/config/calendar';
import { BELL_SCHEDULES, type BellSchedule, type DayTypeId } from '@/config/bellSchedules';
import type { AdminScheduleDay } from './types';
import { useAppStore } from './store';
import { DateTime, isWeekend, isoDate } from './time';

/** Non-reactive snapshots of the live schedule + server data. The components
 *  that display this subscribe to the relevant store slice so they re-render
 *  when it changes. */
function liveSchedule() {
  return useAppStore.getState().liveSchedule;
}
/** Once the real calendar is loaded it enumerates every school day, so any date
 *  it doesn't list is genuinely not a school day (summer, breaks, etc.). */
function liveLoaded() {
  return useAppStore.getState().liveScheduleLoaded;
}
/** The admin-edited day for a date, if the Schedule editor saved one. */
export function editedDayFor(key: string): AdminScheduleDay | undefined {
  return useAppStore.getState().serverData?.scheduleDays?.[key];
}

/**
 * The live calendar hasn't loaded (cold start, proxy unreachable, offline with
 * no cache): show an honest empty day rather than fabricating bell times.
 */
const UNAVAILABLE: BellSchedule = {
  id: 'no-school',
  name: 'Schedule unavailable',
  short: '—',
  description: "We couldn't reach the live schedule.",
  periods: [],
};

/**
 * Static day type (admin-edited day → seed overrides → weekday default). Used
 * as a display tag; the live schedule supersedes it for real dates.
 */
export function dayTypeFor(dt: DateTime): DayTypeId {
  const key = isoDate(dt);
  const edited = editedDayFor(key);
  if (edited?.dayType) return edited.dayType;
  if (DAY_TYPE_OVERRIDES[key]) return DAY_TYPE_OVERRIDES[key];
  return isWeekend(dt) ? 'no-school' : 'regular';
}

/**
 * The real schedule for a date: admin-edited day wins, then the live per-date
 * schedule (true rotation + times), else no-school (calendar loaded, date not
 * listed) or the honest unavailable state (calendar never loaded).
 */
export function resolveSchedule(dt: DateTime): BellSchedule {
  const key = isoDate(dt);
  const edited = editedDayFor(key);
  if (edited) {
    return {
      id: edited.dayType ?? dayTypeFor(dt),
      name: edited.label,
      short: edited.short,
      description: edited.school ? '' : edited.label,
      periods: edited.periods,
    };
  }
  const live = liveSchedule()[key];
  if (live) {
    return {
      id: dayTypeFor(dt), // tag only; display uses name/short below
      name: live.label,
      short: live.short,
      description: live.school ? '' : live.label,
      periods: live.periods,
    };
  }
  // Calendar loaded but no entry ⇒ not a school day.
  if (liveLoaded()) return BELL_SCHEDULES['no-school'];
  // Never loaded: weekends are knowable offline, weekdays are not.
  return isWeekend(dt) ? BELL_SCHEDULES['no-school'] : UNAVAILABLE;
}

/** Back-compat alias for resolveSchedule. */
export function scheduleFor(dt: DateTime): BellSchedule {
  return resolveSchedule(dt);
}

/** Is this a school day? Honors the admin-edited day, then the live calendar. */
export function isSchoolDay(dt: DateTime): boolean {
  const key = isoDate(dt);
  const edited = editedDayFor(key);
  if (edited) return edited.school;
  const live = liveSchedule()[key];
  if (live) return live.school;
  // Unknown (calendar never loaded) counts as not-a-school-day: no countdown
  // is better than a countdown to an invented bell.
  return false;
}

/** Short label for the day-type strip / chips. */
export function dayShortFor(dt: DateTime): string {
  const key = isoDate(dt);
  const edited = editedDayFor(key);
  if (edited) return edited.short;
  const live = liveSchedule()[key];
  if (live) return live.short;
  if (liveLoaded() || isWeekend(dt)) return 'No School';
  return '—';
}

/** Seed events plus admin-authored events (server-owned), minus hidden ones. */
export function allEvents(): SchoolEvent[] {
  const server = useAppStore.getState().serverData?.events ?? [];
  return [...SCHOOL_EVENTS, ...server].filter((e) => !e.hidden);
}

export function eventsFor(isoDay: string): SchoolEvent[] {
  return allEvents().filter((e) => {
    if (e.endDate) return isoDay >= e.date && isoDay <= e.endDate;
    return e.date === isoDay;
  });
}

/** Upcoming events on/after a date, sorted, limited. */
export function upcomingEvents(fromIso: string, limit = 50): SchoolEvent[] {
  return allEvents()
    .filter((e) => (e.endDate ?? e.date) >= fromIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** The next date (starting tomorrow) that is a school day; null if none within range. */
export function nextSchoolDay(from: DateTime, lookahead = 21): DateTime | null {
  for (let i = 1; i <= lookahead; i++) {
    const d = from.plus({ days: i }).startOf('day');
    if (isSchoolDay(d)) return d;
  }
  return null;
}

/**
 * The hour (school time) after which the app stops talking about today and
 * starts talking about the next school day. School lets out between 1:35 and
 * 2:30, so by 5pm "today's schedule" is a spent answer: what a student wants to
 * know that evening is what tomorrow looks like.
 */
export const LOOKAHEAD_HOUR = 17;

/**
 * The day the app should be showing right now: today until 5pm, then the next
 * school day. That's tomorrow on a normal weeknight, and Monday on a Friday
 * evening, which is the answer someone opening the app on Friday night wants.
 *
 * The lookahead stops at a week so a long break can't hijack the home screen
 * with a day nobody is thinking about yet; past that it just rolls to tomorrow
 * and shows it honestly as no school. Before the live calendar has loaded
 * nothing is a school day, so that same fallback applies.
 */
export function focusDay(now: DateTime): { date: DateTime; isToday: boolean } {
  const today = now.startOf('day');
  if (now.hour < LOOKAHEAD_HOUR) return { date: today, isToday: true };
  return { date: nextSchoolDay(today, 7) ?? today.plus({ days: 1 }), isToday: false };
}

/** N upcoming days (including today) with their short label + school flag. */
export function dayTypeStrip(
  from: DateTime,
  days = 5,
): { date: DateTime; short: string; off: boolean }[] {
  return Array.from({ length: days }, (_, i) => {
    const d = from.plus({ days: i }).startOf('day');
    return { date: d, short: dayShortFor(d), off: !isSchoolDay(d) };
  });
}
