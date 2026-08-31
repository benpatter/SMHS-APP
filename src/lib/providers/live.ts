/**
 * Live data from the SMCHS proxy (real smhs.org news + CalendarWiz events).
 * Each fetcher returns null on any failure so callers can fall back to the
 * built-in sample data. We never present stale/empty as if it were live.
 */
import { API_BASE } from '@/config/api';
import type { Announcement } from '@/config/announcements.seed';
import type { SchoolEvent } from '@/config/calendar';
import type { LiveDay } from '@/lib/types';

async function getJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface WeeklyPage {
  items: Announcement[];
  hasMore: boolean;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The board titles every post "Weekly Announcements | (5/18/26 - 5/21/26)".
 * Repeated verbatim in a list that's an ugly wall of pipes and slashes, so
 * turn it into "Week of May 18 – 21, 2026". Unrecognized titles pass through.
 */
export function prettyWeeklyTitle(raw: string): string {
  const m = raw.match(
    /^\s*Weekly Announcements\s*\|?\s*\(?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*\)?\s*$/,
  );
  if (!m) return raw;
  const [, m1, d1, , m2, d2, y2] = m;
  const year = Number(y2) < 100 ? 2000 + Number(y2) : Number(y2);
  const mon1 = MONTHS[Number(m1) - 1];
  const mon2 = MONTHS[Number(m2) - 1];
  if (!mon1 || !mon2) return raw;
  const range =
    m1 === m2 ? `${mon1} ${d1}–${d2}` : `${mon1} ${d1} – ${mon2} ${d2}`;
  return `Week of ${range}, ${year}`;
}

/** One page of Weekly Announcement stubs (title only). Mirrors the site's "Load More". */
export async function fetchWeekly(page = 1): Promise<WeeklyPage | null> {
  const j = await getJson(`/api/weekly?page=${page}`);
  if (!j || !Array.isArray(j.items)) return null;
  return {
    hasMore: !!j.hasMore,
    items: j.items.map(
      (it: { id: string; title: string }): Announcement => ({
        id: it.id,
        title: prettyWeeklyTitle(it.title),
        body: '',
        audience: null,
        channel: 'Weekly Announcements',
        author: 'SMCHS',
        postedAt: '',
      }),
    ),
  };
}

/** A single Weekly Announcement with its full formatted body, for the reading page. */
export async function fetchWeeklyPost(id: string): Promise<Announcement | null> {
  const postId = id.replace(/^weekly-/, '');
  const j = await getJson(`/api/weekly?post=${encodeURIComponent(postId)}`);
  if (!j || !j.item) return null;
  const it = j.item;
  return {
    id: it.id,
    title: prettyWeeklyTitle(it.title || 'Weekly Announcements'),
    body: htmlToText(it.bodyHtml || ''),
    bodyHtml: it.bodyHtml || '',
    audience: null,
    channel: 'Weekly Announcements',
    author: 'SMCHS',
    postedAt: it.postedAt || '',
  };
}

// ---- School news (smhs.org Campus / Arts / Sports boards) --------------------

export interface NewsItem {
  /** "news-<elementId>-<postId>" — names the board as well as the post. */
  id: string;
  /** "Campus News", "Arts News" or "Sports News". */
  channel: string;
  title: string;
  postedAt: string;
  /** Thumbnail from the story card, or '' when the school posted none. */
  image: string;
}

export interface NewsPage {
  items: NewsItem[];
  hasMore: boolean;
}

/** One page of the merged news feed, newest first. */
export async function fetchNews(page = 1): Promise<NewsPage | null> {
  const j = await getJson(`/api/news?page=${page}`);
  if (!j || !Array.isArray(j.items)) return null;
  return {
    hasMore: !!j.hasMore,
    items: j.items.map(
      (it: Partial<NewsItem>): NewsItem => ({
        id: String(it.id ?? ''),
        channel: it.channel || 'News',
        title: it.title || '',
        postedAt: it.postedAt || '',
        image: it.image || '',
      }),
    ),
  };
}

/** A story on the reading page: an announcement plus the photo the school ran. */
export type NewsPost = Announcement & { image: string };

/** One news story with its full formatted body, for the reading page. */
export async function fetchNewsPost(id: string): Promise<NewsPost | null> {
  const j = await getJson(`/api/news?post=${encodeURIComponent(id)}`);
  if (!j || !j.item) return null;
  const it = j.item;
  return {
    id: it.id,
    title: it.title || 'News',
    body: htmlToText(it.bodyHtml || ''),
    bodyHtml: it.bodyHtml || '',
    audience: null,
    channel: it.channel || 'News',
    author: 'SMCHS',
    postedAt: it.postedAt || '',
    image: it.image || '',
  };
}

/**
 * The real, per-date, rotated bell schedule (date → day). Source of truth for
 * day types, rotation, and which period meets when.
 */
export async function fetchLiveSchedule(): Promise<Record<string, LiveDay> | null> {
  const j = await getJson('/api/schedule');
  if (!j || !j.days) return null;
  return j.days as Record<string, LiveDay>;
}

/** Real calendar events from the school's Master Calendar (CalendarWiz). */
export async function fetchLiveEvents(): Promise<SchoolEvent[] | null> {
  const j = await getJson('/api/events');
  if (!j || !Array.isArray(j.events)) return null;
  return j.events.map(
    (e: SchoolEvent): SchoolEvent => ({
      id: e.id,
      date: e.date,
      endDate: e.endDate,
      title: e.title,
      category: e.category,
      time: e.time,
      location: e.location,
    }),
  );
}

// ---- Campus life (real smhs.org pages via the proxy) -------------------------

export interface DiningInfo {
  title: string;
  intro: string;
  hours: { open: string; close: string; daily: boolean } | null;
  payment: string[];
  contact: string;
  menuPdf: string;
  sections: string[];
  /** The lunch-by-building chart, straight from the school's table. */
  lunch: { first: string[]; second: string[] };
  guidelines: string[];
}

/** Campus Dining: Hanna's on Campus, scraped from the live page. */
export async function fetchDining(): Promise<DiningInfo | null> {
  const j = await getJson('/api/dining');
  return j && j.title ? (j as DiningInfo) : null;
}

export interface Club {
  name: string;
  category: string;
  description: string;
  moderator: string;
  email: string;
}

export interface ClubsInfo {
  year: string;
  clubs: Club[];
  rush: string;
}

/** The real club directory (the year's Clubs table on smhs.org). */
export async function fetchClubs(): Promise<ClubsInfo | null> {
  const j = await getJson('/api/clubs');
  return j && Array.isArray(j.clubs) && j.clubs.length > 0 ? (j as ClubsInfo) : null;
}

export interface CampusBuilding {
  num: number;
  name: string;
}

export interface CampusInfo {
  buildings: CampusBuilding[];
  mapUrl: string;
  locatorUrl: string;
  securityPhone: string;
}

/** The official numbered building directory + downloadable campus map. */
export async function fetchCampus(): Promise<CampusInfo | null> {
  const j = await getJson('/api/campus');
  return j && Array.isArray(j.buildings) && j.buildings.length > 0 ? (j as CampusInfo) : null;
}

export interface SafetyInfo {
  securityPhone: string;
  hours: string;
  closedCampus: string;
  visitorPolicy: string;
  tipLineUrl: string;
}

/** Safety & Security essentials (security phone, policies, anonymous tip line). */
export async function fetchSafety(): Promise<SafetyInfo | null> {
  const j = await getJson('/api/safety');
  return j && j.securityPhone ? (j as SafetyInfo) : null;
}

