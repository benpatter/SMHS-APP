/**
 * The ONE calendar (kills the old "two calendars" problem).
 *
 * - `dayTypes` maps an ISO date (yyyy-MM-dd, school timezone) to the bell
 *   schedule that runs that day. Any weekday WITHOUT an entry defaults to a
 *   Regular Day; weekends default to No School. This means the home-screen day
 *   type is always driven by this one config.
 * - `events` are school events shown on the calendar tab.
 *
 * confirmWithSchool: the real academic-year day-type map and event list.
 */

import type { DayTypeId } from './bellSchedules';

export interface SchoolEvent {
  id: string;
  date: string; // yyyy-MM-dd
  endDate?: string; // yyyy-MM-dd (inclusive) for multi-day events
  title: string;
  category: 'academic' | 'athletics' | 'arts' | 'ministry' | 'campus-life' | 'holiday';
  location?: string;
  time?: string; // free-text, e.g. "7:00 PM"
  /**
   * Where the game is played, shown as the badge on athletics rows ("Home",
   * an opponent school, …). Admin-set via eventEdits; empty = no badge.
   */
  venue?: string;
  /** Admin-deleted (via eventEdits); only the admin editor still shows it. */
  hidden?: boolean;
  /** "Possible … CIF" placeholder games from the live sports feed. */
  tentative?: boolean;
}

/**
 * Day-type overrides are now driven by the school's live Master Calendar (via the
 * proxy → `liveSchedule`). This static map is intentionally EMPTY: it exists only
 * as a typed offline fallback and must not contain placeholder dates. Admins can
 * still force a day type on-device via the admin console.
 */
export const DAY_TYPE_OVERRIDES: Record<string, DayTypeId> = {};

/**
 * Events come from the school's live calendar (proxy → CalendarWiz) plus anything
 * admins add on-device. No placeholder events: this stays EMPTY.
 */
export const SCHOOL_EVENTS: SchoolEvent[] = [];
