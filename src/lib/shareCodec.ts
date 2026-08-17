/**
 * Encodes a personal schedule into a compact, URL-safe string so two students
 * can compare schedules with NO server, just a QR code or link. Everything is
 * carried in the URL itself; nothing is uploaded anywhere.
 */
import type { LunchTrack, PersonalSchedule } from './types';

export interface SharePayload {
  v: 1;
  /** Legacy: lunch is now derived from the 3rd-period building. Optional. */
  lunch?: LunchTrack;
  schedule: PersonalSchedule;
  name?: string;
}

function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromUrlSafe(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  return b64 + pad;
}

export function encodeShare(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  // Handle Unicode safely before base64.
  const bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return toUrlSafe(btoa(bytes));
}

export function decodeShare(code: string): SharePayload | null {
  try {
    const bytes = atob(fromUrlSafe(code));
    const json = decodeURIComponent(
      Array.from(bytes)
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const parsed = JSON.parse(json) as SharePayload;
    if (parsed && parsed.v === 1 && typeof parsed.schedule === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

export interface ScheduleMatch {
  periodNumber: number;
  mine?: string;
  theirs?: string;
  sameRoom: boolean;
}

/** Periods both students have (both non-free). Answers "do we have it together?". */
export function compareSchedules(
  mine: PersonalSchedule,
  theirs: PersonalSchedule,
): ScheduleMatch[] {
  const matches: ScheduleMatch[] = [];
  for (let n = 1; n <= 7; n++) {
    const a = mine[n];
    const b = theirs[n];
    if (a && b && !a.free && !b.free) {
      matches.push({
        periodNumber: n,
        mine: a.name || `Period ${n}`,
        theirs: b.name || `Period ${n}`,
        sameRoom: !!a.room && a.room === b.room,
      });
    }
  }
  return matches;
}
