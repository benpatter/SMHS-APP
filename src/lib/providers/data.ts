/**
 * Server-owned app content (campus map pins + outlines), fetched from the
 * proxy's /api/data and cached on-device with its ETag. The server is the
 * source of truth; the cache means devices re-download only when something
 * actually changed (304 = keep what you have). When the proxy is unreachable
 * the last cached copy is used; if there is none, callers fall back to the
 * seed data bundled with the app.
 */
'use client';

import { API_BASE } from '@/config/api';
import type { Announcement } from '@/config/announcements.seed';
import type { SchoolEvent } from '@/config/calendar';
import type { MenuItem } from '@/config/dining.seed';
import type { CampusOutline, CampusPOI } from '@/config/campus3d/types';
import type { Prayer } from '@/config/prayers.seed';
import type { ContactGroup } from '@/config/contacts';
import type { AdminAlert, DiningOverrides, PageNotice, SchoolOverrides } from '@/lib/store';
import type { AdminScheduleDay } from '@/lib/types';
import { getSessionToken } from '@/lib/portalAuth';

/**
 * Admin overrides for a live-calendar athletics event, keyed by the event's id.
 * Fields override the feed's values; `venue` is the game-location badge (empty
 * or absent = no badge).
 */
export interface AthleticsEventEdit {
  title?: string;
  time?: string;
  location?: string;
  venue?: string;
  /** Deleted by an admin: kept out of every list until restored. */
  hidden?: boolean;
}

export interface ServerData {
  pois?: CampusPOI[];
  outlines?: CampusOutline[];
  announcements?: Announcement[];
  diningItems?: MenuItem[];
  dining?: DiningOverrides;
  /** School contact/link overrides (attendance phone, Aeries URL). */
  school?: SchoolOverrides;
  /** Legacy single banner. New writes live in `notices`; this drains to null. */
  alert?: AdminAlert | null;
  /** Admin notices: per-page info boxes + school-wide banners (page '*'). */
  notices?: PageNotice[];
  /** Admin-edited days (date → full replacement schedule). Wins over live. */
  scheduleDays?: Record<string, AdminScheduleDay>;
  /** The prayer book (admin-maintained; seed in config/prayers.seed.ts). */
  prayers?: Prayer[];
  eventEdits?: Record<string, AthleticsEventEdit>;
  /** Admin-added events (beyond the live feed), shared by every device. */
  events?: SchoolEvent[];
  /** The "who to contact" directory (admin-maintained; seed in config/contacts.ts). */
  contactGroups?: ContactGroup[];
  updatedAt?: string;
}

const CACHE_KEY = 'smchs-server-data';

interface Cached {
  etag: string | null;
  data: ServerData;
  /** Local edits that never reached the server (push failed / not signed in). */
  dirty?: boolean;
}

export interface CachedData {
  data: ServerData;
  dirty: boolean;
}

export function readCache(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    return { data: c.data, dirty: Boolean(c.dirty) };
  } catch {
    return null;
  }
}

export function readCachedData(): ServerData | null {
  return readCache()?.data ?? null;
}

function writeCache(etag: string | null, data: ServerData, dirty = false) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ etag, data, dirty } satisfies Cached));
  } catch {
    // storage full/blocked — fetching still works, just no offline cache
  }
}

/** Record a local edit immediately, marked unsynced, so a restart can't lose it. */
export function cacheServerData(data: ServerData) {
  writeCache(readEtag(), data, true);
}

/** Drop the local copy (edits included): the next fetch re-adopts the server's. */
export function discardCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // storage blocked — nothing to discard
  }
}

function readEtag(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached).etag : null;
  } catch {
    return null;
  }
}

/**
 * The latest server data: fresh from the proxy when it changed, the cached
 * copy when it didn't (304) or when the proxy is down, and null only when
 * there has never been a successful fetch on this device.
 */
export async function fetchServerData(): Promise<ServerData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/data`, {
      headers: readEtag() ? { 'If-None-Match': readEtag()! } : {},
      cache: 'no-store',
    });
    if (res.status === 304) return readCachedData();
    if (!res.ok) return readCachedData();
    const data = (await res.json()) as ServerData;
    // NEVER let a fetch clear the dirty flag. A device holding an edit that
    // hasn't reached the server yet would otherwise lose it the moment anyone
    // else wrote — silently, since the caller sees a perfectly good response.
    // The edit stays pending until a push actually succeeds.
    if (!readCache()?.dirty) writeCache(res.headers.get('ETag'), data);
    return data;
  } catch {
    return readCachedData();
  }
}

/**
 * How a push ended: 'ok' (server + cache updated), 'conflict' (someone else
 * wrote since this copy was read — refetch before retrying), 'forbidden' (this
 * account may not publish changes — retrying will never help), or 'error'
 * (offline / not signed in — keep local state, retry later).
 */
export type PushResult = 'ok' | 'conflict' | 'forbidden' | 'error';

/** Replace keys on the server (staff session required). */
export async function pushServerData(data: ServerData): Promise<PushResult> {
  const token = getSessionToken();
  if (!token) return 'error';
  try {
    // If-Match pins the version this edit was based on; the server answers 412
    // when someone else wrote since, so a stale snapshot can't erase their work.
    const etag = readEtag();
    const res = await fetch(`${API_BASE}/api/data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(etag ? { 'If-Match': etag } : {}),
      },
      body: JSON.stringify(data),
    });
    if (res.status === 412) return 'conflict';
    // 401/403 are permanent for this session: retrying every 30s forever while
    // telling the admin "it'll sync once the server is back" is a lie.
    if (res.status === 401 || res.status === 403) return 'forbidden';
    if (!res.ok) return 'error';
    writeCache(res.headers.get('ETag'), (await res.json()) as ServerData, false);
    return 'ok';
  } catch {
    return 'error';
  }
}
