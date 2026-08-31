/**
 * Client for the anonymous support-ticket API. A ticket carries no identity —
 * the server knows only this device's random metrics id, which is how the
 * resolution notice ("The app team resolved Ticket N") finds its way back
 * to the sender and to nobody else.
 */
'use client';

import { API_BASE } from '@/config/api';
import { metricsDeviceId, metricsRole } from './metrics';

export interface MyTicket {
  num: number;
  subject: string;
  createdAt: string;
  resolved: boolean;
}

/** Ticket numbers whose resolution this device has already been shown. */
const SEEN_KEY = 'smchs-support-resolved-seen';

export function seenResolvedNums(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function markResolvedSeen(nums: number[]): void {
  try {
    const seen = new Set([...seenResolvedNums(), ...nums]);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-100)));
  } catch {
    // storage blocked: the notice may show again next boot, which is harmless
  }
}

export async function submitTicket(
  subject: string,
  body: string,
  /** Optional, sender-volunteered: gives admins someone to write to if the
   *  ticket can't be resolved on its own. Empty = stay fully anonymous. */
  email?: string,
): Promise<{ ok: true; num: number } | { ok: false; error: string }> {
  const device = metricsDeviceId();
  const role = metricsRole();
  if (!device || !role) {
    return { ok: false, error: 'Could not send from this device. Try again after signing in.' };
  }
  try {
    const res = await fetch(`${API_BASE}/api/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, role, subject, body, ...(email?.trim() ? { email: email.trim() } : {}) }),
    });
    const json = await res.json();
    if (res.ok && json.ok) return { ok: true, num: Number(json.num) };
    return { ok: false, error: json.error || 'Could not send the ticket. Try again.' };
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' };
  }
}

/** This device's own tickets (numbers, subjects, resolved state). */
export async function fetchMyTickets(): Promise<MyTicket[] | null> {
  const device = metricsDeviceId();
  if (!device) return null;
  try {
    const res = await fetch(`${API_BASE}/api/support/status?device=${encodeURIComponent(device)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json.tickets) ? json.tickets : null;
  } catch {
    return null;
  }
}
