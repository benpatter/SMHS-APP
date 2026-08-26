/**
 * Encodes a personal schedule into a compact, URL-safe string so two students
 * can compare schedules with NO server, just a QR code or link. Everything is
 * carried in the URL itself; nothing is uploaded anywhere.
 */
import type { LunchTrack, PersonalClass, PersonalSchedule } from './types';

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

export interface PeriodComparison {
  periodNumber: number;
  /** The viewer's own entry for this block, if they set one. */
  mine?: PersonalClass;
  /** The shared schedule's entry for this block, if they set one. */
  theirs?: PersonalClass;
  /** Same section: the two of you are in this class together. */
  together: boolean;
  /** Same course, but a teacher or room says it's a different section. */
  otherSection: boolean;
}

/** Trimmed, case- and spacing-insensitive, for comparing hand-typed fields. */
function norm(v: string | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Line up two schedules block by block.
 *
 * "Together" needs two independent signals to agree, because one alone lies:
 * both being busy in Block 3 says nothing (everyone is), and a matching course
 * name can still be two different sections of it. So it takes either the same
 * teacher AND room, or the same course with nothing contradicting it. A course
 * that matches while the teacher or room disagrees is called out as a different
 * section instead of being passed off as a class you share.
 */
export function comparePeriods(
  mine: PersonalSchedule,
  theirs: PersonalSchedule,
): PeriodComparison[] {
  const rows: PeriodComparison[] = [];
  for (let n = 1; n <= 7; n++) {
    const a = mine[n];
    const b = theirs[n];
    // Nothing on either side: no row to show.
    if (!a && !b) continue;

    const bothInClass = Boolean(a && b && !a.free && !b.free);
    const sameName = Boolean(norm(a?.name)) && norm(a?.name) === norm(b?.name);
    const sameRoom = Boolean(norm(a?.room)) && norm(a?.room) === norm(b?.room);
    const sameTeacher = Boolean(norm(a?.teacher)) && norm(a?.teacher) === norm(b?.teacher);
    const teachersDiffer =
      Boolean(norm(a?.teacher)) && Boolean(norm(b?.teacher)) && !sameTeacher;
    const roomsDiffer = Boolean(norm(a?.room)) && Boolean(norm(b?.room)) && !sameRoom;

    const together =
      bothInClass && ((sameRoom && sameTeacher) || (sameName && !teachersDiffer && !roomsDiffer));
    rows.push({
      periodNumber: n,
      mine: a,
      theirs: b,
      together,
      otherSection: bothInClass && sameName && !together,
    });
  }
  return rows;
}

/** How many blocks the two of you are actually in together. */
export function togetherCount(rows: PeriodComparison[]): number {
  return rows.filter((r) => r.together).length;
}
