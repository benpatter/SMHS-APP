/**
 * All time logic is explicit about the school timezone (America/Los_Angeles).
 * The device clock may be anywhere; the bell schedule is always Pacific.
 */
import { DateTime } from 'luxon';
import { TIMEZONE } from '@/config/school';
import { useAppStore } from './store';

/**
 * "Now" in the school timezone. Honors the demo "time travel" offset so the whole
 * app (countdown, day type, schedule) can render as any past/future moment and
 * still tick live. Offset is 0 in normal use.
 */
export function nowInSchoolTz(): DateTime {
  const offset = useAppStore.getState().clockOffsetMs || 0;
  const base = DateTime.now().setZone(TIMEZONE);
  return offset ? base.plus({ milliseconds: offset }) : base;
}

/** ISO date (yyyy-MM-dd) for a DateTime already in school tz. */
export function isoDate(dt: DateTime): string {
  return dt.toFormat('yyyy-MM-dd');
}

/** Combine an ISO date and an "HH:mm" string into a school-tz DateTime. */
export function atTime(isoDay: string, hhmm: string): DateTime {
  return DateTime.fromFormat(`${isoDay} ${hhmm}`, 'yyyy-MM-dd HH:mm', {
    zone: TIMEZONE,
  });
}

/** 0 = Sunday … 6 = Saturday, in school tz. */
export function weekdayIndex(dt: DateTime): number {
  return dt.weekday % 7; // luxon: 1=Mon..7=Sun -> 0=Sun..6=Sat
}

export function isWeekend(dt: DateTime): boolean {
  const d = weekdayIndex(dt);
  return d === 0 || d === 6;
}

/**
 * Format a duration (in seconds) as a clock countdown.
 * >= 1h -> H:MM:SS, else M:SS. Never negative.
 */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "8:00 AM" style. */
export function formatClock(dt: DateTime): string {
  return dt.toFormat('h:mm a');
}

/** "Mon, Jun 22" style. */
export function formatDayLabel(dt: DateTime): string {
  return dt.toFormat('ccc, LLL d');
}

/**
 * "Today" / "Tomorrow" / "Yesterday" for a date near today, else its weekday
 * ("Monday"). Every caller appends a possessive 's, and all four forms take one.
 */
export function relativeDayName(date: DateTime, today: DateTime): string {
  const days = Math.round(date.startOf('day').diff(today.startOf('day'), 'days').days);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return date.toFormat('cccc');
}

/** "3h ago", "Yesterday", "Jun 18", relative to now in school tz. */
export function formatRelative(iso: string): string {
  const then = DateTime.fromISO(iso, { zone: TIMEZONE });
  if (!then.isValid) return '';
  const now = nowInSchoolTz();
  const mins = Math.round(now.diff(then, 'minutes').minutes);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && now.hasSame(then, 'day')) return `${hours}h ago`;
  if (now.minus({ days: 1 }).hasSame(then, 'day')) return 'Yesterday';
  return then.toFormat('LLL d');
}

export { DateTime };
