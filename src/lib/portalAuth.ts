/**
 * Client for the proxy's portal-auth endpoints (staff passwords for the Admin
 * and Teacher portals). Accounts are keyed by directory email; passwords are
 * created via an emailed one-time setup link (or, on a server without SMTP,
 * a link handed back to the client in demo mode).
 */
'use client';

import { API_BASE } from '@/config/api';

async function post(path: string, body: unknown): Promise<{ status: number; json: any } | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  } catch {
    return null; // proxy unreachable
  }
}

/**
 * The staff session token (Bearer) for staff-only APIs: server-data writes and
 * student pass history. Kept in localStorage so a signed-in teacher's session
 * survives restarts, mirroring the persisted StaffProfile in the store.
 */
const SESSION_KEY = 'smchs-staff-session';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    // storage unavailable: staff APIs will just re-prompt
  }
}

/** Who the server says this session belongs to, enough to rebuild a sign-in. */
export interface SessionIdentity {
  email: string;
  name: string;
  title: string;
  portal: 'admin' | 'teacher';
}

/**
 * How a session check ended.
 * - 'ok'      the session is live (and has just been renewed).
 * - 'expired' the server rejected it. The ONLY signal that means signed out.
 * - 'offline' the check couldn't be made (proxy down, no network, 5xx). Says
 *             nothing about the sign-in, so it must never end one.
 */
export type SessionStatus = 'ok' | 'expired' | 'offline';

export interface SessionResult {
  status: SessionStatus;
  /** Present when the server rebuilt the session from its durable cookie. */
  restored?: boolean;
  identity?: SessionIdentity;
}

/**
 * Confirm the session with the server — which also RENEWS it, since the server
 * slides a session's expiry every time it's used. Called on launch and on
 * return to the foreground, so a staff member who keeps opening the app never
 * lapses.
 *
 * It doubles as the RECOVERY path. The app is a home-screen PWA, so WebKit
 * sweeps localStorage on its own schedule and takes the token (and the saved
 * profile) with it — the "logged out after about a day" report. The server also
 * keeps the session in an HttpOnly cookie, which that sweep can't touch, so
 * this call still succeeds afterwards: it hands back a fresh token and who this
 * is, and the caller restores the sign-in with no password and no prompt.
 */
export async function refreshSession(): Promise<SessionResult> {
  const r = await post('/api/auth/session', { token: getSessionToken() ?? '' });
  if (!r) return { status: 'offline' }; // unreachable — says nothing about the session
  if (r.status === 401) return { status: 'expired' };
  if (!r.json?.ok) return { status: 'offline' };
  if (r.json.token) setSessionToken(r.json.token); // re-arm after a storage sweep
  return { status: 'ok', restored: Boolean(r.json.restored), identity: r.json.identity };
}

export function clearSessionToken(): void {
  try {
    // Revoke server-side too: dropping only the local copy leaves the session
    // live on the server for its full 30 days, so "sign out" wouldn't actually
    // pull the one lever staff have against a leaked token. Best-effort — an
    // offline sign-out still clears the device, and the session expires anyway.
    const token = localStorage.getItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (token) void post('/api/auth/logout', { token });
  } catch {
    // storage unavailable: nothing to clear
  }
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const r = await post('/api/auth/login', { email, password });
  if (!r) return { ok: false, error: 'Could not reach the server. Try again.' };
  if (!r.json.ok) return { ok: false, error: r.json.error || 'Login failed' };
  if (r.json.token) {
    try {
      localStorage.setItem(SESSION_KEY, r.json.token);
    } catch {
      // storage unavailable: staff APIs will just re-prompt
    }
  }
  return { ok: true };
}

export interface SetupResult {
  ok: boolean;
  /** True when the setup email actually went out. */
  emailed?: boolean;
  /** Demo mode (no SMTP on the server): the setup link comes back directly. */
  setupUrl?: string;
  error?: string;
}

export async function requestPasswordSetup(email: string): Promise<SetupResult> {
  const r = await post('/api/auth/request-setup', { email, origin: window.location.origin });
  if (!r) return { ok: false, error: 'Could not reach the server. Try again.' };
  if (!r.json.ok) return { ok: false, error: r.json.error || 'Could not start password setup' };
  return { ok: true, emailed: Boolean(r.json.emailed), setupUrl: r.json.setupUrl };
}

export async function setPassword(
  token: string,
  password: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const r = await post('/api/auth/set-password', { token, password });
  if (!r) return { ok: false, error: 'Could not reach the server. Try again.' };
  return r.json.ok
    ? { ok: true, email: r.json.email }
    : { ok: false, error: r.json.error || 'Could not set the password' };
}

// ---- Hand-granted admin access ----------------------------------------------
// Admins can grant Admin-portal access to any directory member from the app
// (Administration → Admins). A grant only widens which portal admits the
// account — same email, same password. The list is public (see the server
// route), because the sign-in picker needs it before anyone is signed in.

/** Emails granted admin access by hand, or null when the server is unreachable. */
export async function fetchAdminGrants(): Promise<string[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/admins`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j.emails) ? j.emails : null;
  } catch {
    return null;
  }
}

/** Grant or revoke: POSTs with this device's staff session (must be an admin). */
async function postGrantChange(
  path: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getSessionToken() ?? ''}`,
      },
      body: JSON.stringify({ email }),
    });
    const j = await res.json();
    return j.ok ? { ok: true } : { ok: false, error: j.error || 'The change was not saved' };
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' };
  }
}

export function grantAdminAccess(email: string): Promise<{ ok: boolean; error?: string }> {
  return postGrantChange('/api/auth/admins/grant', email);
}

export function revokeAdminAccess(email: string): Promise<{ ok: boolean; error?: string }> {
  return postGrantChange('/api/auth/admins/revoke', email);
}
