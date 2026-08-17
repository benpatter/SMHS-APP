/**
 * The local profile, the "login". Lives only on-device (localStorage), never a
 * server. Holds the lightweight profile, the optional personalized schedule,
 * notification prefs, and the on-device ADMIN overlay (see AdminState).
 *
 * Admin model: there is no server, so administrators edit on this device. Their
 * edits are stored here and overlaid on top of the built-in seed/config (extra
 * announcements/events/games, day-type overrides, a school-wide alert banner,
 * and contact/link overrides). This is the "for now" model: the same store
 * shape is what a future backend would sync.
 */
'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AdminScheduleDay,
  LiveDay,
  PersonalClass,
  PersonalSchedule,
  Profile,
} from './types';
import type { Announcement } from '@/config/announcements.seed';
import type { SchoolEvent } from '@/config/calendar';
import type { MenuItem } from '@/config/dining.seed';
import type { CampusOutline, CampusPOI } from '@/config/campus3d/types';
import { SEED_OUTLINES } from '@/config/campus3d/outlines';
import { SEED_ANNOUNCEMENTS } from '@/config/announcements.seed';
import { DINING_MENU } from '@/config/dining.seed';
import { SEED_PRAYERS, type Prayer } from '@/config/prayers.seed';
import {
  CONTACT_GROUPS,
  contactSlug,
  type ContactEntry,
  type ContactGroup,
} from '@/config/contacts';
import {
  mergeAnnouncements,
  mergeDiningItems,
  mergeOutlines,
} from './adminOverlay';
import {
  cacheServerData,
  discardCache,
  fetchServerData,
  pushServerData,
  readCache,
  type AthleticsEventEdit,
  type ServerData,
} from './providers/data';
import { clearSessionToken, getSessionToken } from './portalAuth';

export interface NotificationPrefs {
  announcements: boolean;
  classChange: boolean; // "Period 3 starts in 5 min" nudges
  grades: boolean; // once the real provider is live
  /**
   * Bell alerts: a system notification ~5 minutes before the current period
   * ends while the app is open (the app has no push server by design).
   */
  bell: boolean;
}

/** A school-wide banner administrators can raise (closures, emergencies, info). */
export interface AdminAlert {
  message: string;
  tone: 'info' | 'urgent';
}

/**
 * An admin info box pinned to one page (the Club Rush card look), or the
 * school-wide banner when `page` is '*'. Server-owned: every device sees it.
 */
export interface PageNotice {
  id: string;
  /** Route it shows on ('/more/clubs'), or '*' = banner under the header on every page. */
  page: string;
  /** Optional heading. Page cards only; the banner shows just the message. */
  title?: string;
  message: string;
  tone: 'gold' | 'info' | 'urgent';
}

/** Optional overrides for contact details / external links. */
export interface SchoolOverrides {
  aeriesWebPortal?: string;
  attendancePhone?: string;
  attendancePhoneDisplay?: string;
  /** How to report an absence (the paragraph on More → Report an Absence). */
  attendanceProcedure?: string;
  /** Attendance Office hours, as they should read on screen. */
  attendanceHours?: string;
  /** Campus Security line, used when the live safety page can't be reached. */
  securityPhone?: string;
  /** Campus Ministry's prayer request form. */
  prayerRequestFormUrl?: string;
  /** Where "Buy Tickets" goes on the athletics page. */
  athleticsTicketsUrl?: string;
  /** Where "Watch Live" goes on the athletics page. */
  athleticsLivestreamUrl?: string;
}

/**
 * Admin overrides for Campus Dining: the vendor changes their menu, prices,
 * and hours over time, so the school (not a developer) maintains them here.
 */
export interface DiningOverrides {
  /** Free-text hours override, e.g. "7:00 AM – 3:00 PM". Wins over live. */
  hours?: string;
  /** Contact email override. Wins over live. */
  contact?: string;
}

/**
 * On-device admin overlay. Everything here is additive to / overrides the static
 * seed config. Empty by default: a fresh device shows only the built-in data.
 */
export interface AdminState {
  /** Staff passcode. null until an admin sets one (first unlock). */
  pin: string | null;
  /** Admin-authored announcements, shown alongside the seed feed. */
  announcements: Announcement[];
  /** Seed (or admin) announcement ids to suppress. */
  hiddenAnnouncementIds: string[];
  /** Active school-wide banner, or null. */
  alert: AdminAlert | null;
  school: SchoolOverrides;
  /** Admin-added menu items (the seed menu ships in config/dining.seed.ts). */
  diningItems: MenuItem[];
  /** Menu item ids (seed or admin) to hide. */
  hiddenDiningIds: string[];
  /** Per-item edits (price/name/description…) applied over seed AND admin items. */
  diningEdits: Record<string, Partial<MenuItem>>;
  dining: DiningOverrides;
  /** Admin-added map locations (the seed pins ship in config/campus3d/pois.ts). */
  pois: CampusPOI[];
  /** POI ids (seed or admin) hidden from the campus map. */
  hiddenPoiIds: string[];
  /** Per-pin edits (name/position/…) applied over seed AND admin pins. */
  poiEdits: Record<string, Partial<CampusPOI>>;
  /** Admin-drawn map outlines (seed footprints ship in config/campus3d/outlines.ts). */
  outlines: CampusOutline[];
  /** Outline ids (seed or admin) removed from the campus map. */
  hiddenOutlineIds: string[];
  /** Per-outline edits (reshaped corners, labels…) applied over seed AND admin. */
  outlineEdits: Record<string, Partial<CampusOutline>>;
}

/** A staff member signed in to a staff portal (session-only). */
export interface PortalUser {
  name: string;
  email: string;
  role: 'admin' | 'teacher';
}

/** Which kind of person this device belongs to. null = not chosen yet (welcome screen). */
export type UserRole = 'student' | 'staff' | 'parent' | null;

/** A child added on a parent device. Name is optional (they can skip it). */
export interface ParentChild {
  id: string;
  name: string;
  /**
   * Their graduation year, which is what makes the schedule THEIRS: it decides
   * their split-mass column, and whether grade-limited periods (a class
   * meeting, a grade-only Mass) belong on their day. Null until the parent
   * picks one; the app then shows every grade's periods rather than guessing.
   */
  gradYear?: number | null;
}

/**
 * A staff sign-in that survives restarts. `title` is their role in the school,
 * straight from the staff/faculty directory; `portal` is which portal they used.
 */
export interface StaffProfile {
  name: string;
  email: string;
  title: string;
  portal: 'admin' | 'teacher';
}

/** The last student who signed in on this device. Powers "Are you X?" re-login. */
export interface RememberedStudent {
  name: string;
  email: string;
  gradYear: number | null;
}

export interface AppState {
  profile: Profile;
  /** Student or staff device? Drives the welcome screen and which UI boots. */
  userRole: UserRole;
  /** The signed-in staff member (persists across restarts). */
  staffProfile: StaffProfile | null;
  /** Last student sign-in on this device (survives sign-out, for re-login). */
  rememberedStudent: RememberedStudent | null;
  /** Last staff sign-in on this device (survives sign-out, for re-login). */
  rememberedStaff: StaffProfile | null;
  /** Children added on a parent device (parent role only). */
  parentChildren: ParentChild[];
  /** Each child's own schedule, by child id (parent role only). */
  childSchedules: Record<string, PersonalSchedule>;
  /** Which child's page the parent is currently viewing. */
  activeChildId: string | null;
  /**
   * The student's own schedule, parked while a parent session uses the
   * `schedule` canvas for child schedules. Restored on parent sign-out.
   */
  stashedStudentSchedule: PersonalSchedule | null;
  schedule: PersonalSchedule;
  notifications: NotificationPrefs;
  admin: AdminState;
  /** Transient (never persisted): is the admin console unlocked this session? */
  adminUnlocked: boolean;
  /** Transient: who is signed in to the Admin/Teacher portal this session. */
  portalUser: PortalUser | null;
  /**
   * Transient: the server rejected this device's staff token, so publishing
   * needs a password again. The local sign-in is deliberately KEPT — the portal
   * stays open and everything read-only keeps working; only the "your changes
   * can reach everyone" promise is withdrawn, and only once the server has
   * actually said so (never on a failed request).
   */
  staffSessionExpired: boolean;
  /** Transient: the real per-date schedule from the live proxy (date → day). */
  liveSchedule: Record<string, LiveDay>;
  liveScheduleLoaded: boolean;
  /** Transient demo "time travel": ms added to the real clock (0 = real time). */
  clockOffsetMs: number;
  hydrated: boolean;

  /** Student sign-in from the welcome screen (email already domain-validated). */
  signInStudent: (name: string, email: string, gradYear: number | null) => void;
  /** Student sign-out: back to the welcome screen, but remembered for re-login. */
  signOutStudent: () => void;
  /** "Staff" picked on the welcome screen (before any portal sign-in). */
  chooseStaff: () => void;
  /** Staff portal sign-in. Persists so the app boots straight to their portal. */
  signInStaff: (staff: StaffProfile) => void;
  /** Record what the server said about this device's staff token. */
  setStaffSessionExpired: (expired: boolean) => void;
  /**
   * Put back a staff sign-in the DEVICE lost, from a session the server still
   * recognizes. Not a new sign-in: no password was entered, so it must not
   * disturb anything already on this device — see the guard in AppShell.
   */
  restoreStaffSession: (staff: StaffProfile) => void;
  /** Staff sign-out: back to the welcome screen, but remembered for re-login. */
  signOutStaff: () => void;
  /** "Parent" picked on the welcome screen: enter the parent hub. */
  chooseParent: () => void;
  /** Add a child on the parent hub (name may be empty — naming is optional). */
  addParentChild: (name: string, gradYear?: number | null) => void;
  updateParentChild: (id: string, patch: Partial<Omit<ParentChild, 'id'>>) => void;
  /** Delete a child and their schedule. */
  deleteParentChild: (id: string) => void;
  /** Open a child's page: their schedule becomes the active canvas. */
  selectParentChild: (id: string) => void;
  /** Parent sign-out: back to the welcome screen. Children are remembered. */
  signOutParent: () => void;
  setProfile: (patch: Partial<Profile>) => void;
  setClass: (periodNumber: number, patch: PersonalClass) => void;
  clearClass: (periodNumber: number) => void;
  setNotificationPref: (key: keyof NotificationPrefs, on: boolean) => void;
  importSchedule: (schedule: PersonalSchedule) => void;
  resetAll: () => void;

  // --- Admin ---
  /** Unlock with a passcode. If no pin is set yet, this sets it. Returns success. */
  unlockAdmin: (pin: string) => boolean;
  lockAdmin: () => void;
  setAdminPin: (pin: string) => void;
  /**
   * Portal sign-in/out. Signing in also unlocks the admin-gated pages so a
   * portal user never hits the on-device PIN prompt; signing out re-locks.
   */
  setPortalUser: (user: PortalUser | null) => void;

  addAnnouncement: (a: Omit<Announcement, 'id'>) => void;
  updateAnnouncement: (id: string, patch: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => void;
  setAnnouncementHidden: (id: string, hidden: boolean) => void;

  /** Save a full replacement schedule for one date (server-owned, all devices). */
  setScheduleDay: (iso: string, day: AdminScheduleDay) => void;
  /** Drop the edit for a date: it falls back to the live calendar / template. */
  clearScheduleDay: (iso: string) => void;

  addEvent: (e: Omit<SchoolEvent, 'id'>) => void;
  updateEvent: (id: string, patch: Partial<SchoolEvent>) => void;
  deleteEvent: (id: string) => void;
  setEventHidden: (id: string, hidden: boolean) => void;

  /**
   * Override a live-calendar athletics event (name/time/field/venue) on the
   * shared server list. Empty-string fields clear back to the feed's value.
   */
  updateAthleticsEvent: (id: string, patch: AthleticsEventEdit) => void;
  /** Add an event of our own to the shared server list (every device sees it). */
  addAthleticsEvent: (e: Omit<SchoolEvent, 'id'>) => void;
  /**
   * Delete an event everywhere: admin-added events are removed outright;
   * live-feed events get a hidden override (restorable — the feed would just
   * resend a hard-deleted one).
   */
  deleteAthleticsEvent: (id: string) => void;

  // --- Notices (server-owned): page info boxes + the school-wide banner ---
  addNotice: (n: Omit<PageNotice, 'id'>) => void;
  updateNotice: (id: string, patch: Partial<Omit<PageNotice, 'id'>>) => void;
  deleteNotice: (id: string) => void;

  setSchoolOverride: (patch: Partial<SchoolOverrides>) => void;
  resetAdmin: () => void;

  // --- Campus Dining (admin-maintained menu) ---
  addDiningItem: (item: Omit<MenuItem, 'id'>) => void;
  /** Edit any item (seed or admin), stored as an overlay patch by id. */
  updateDiningItem: (id: string, patch: Partial<MenuItem>) => void;
  /** Remove an admin-added item entirely (seed items are hidden, not deleted). */
  deleteDiningItem: (id: string) => void;
  setDiningItemHidden: (id: string, hidden: boolean) => void;
  setDiningOverride: (patch: Partial<DiningOverrides>) => void;

  // --- Prayer book (server-owned; seed in config/prayers.seed.ts) ---
  addPrayer: (p: Omit<Prayer, 'id'>) => void;
  updatePrayer: (id: string, patch: Partial<Prayer>) => void;
  deletePrayer: (id: string) => void;
  /** Persist a new prayer order (ids in display order, hidden ones included). */
  reorderPrayers: (ids: string[]) => void;

  // --- Contact directory (server-owned; seed in config/contacts.ts) ---
  /** Add a topic to a category. Ids for it and its people are minted here. */
  addContactEntry: (groupId: string, entry: Omit<ContactEntry, 'id'>) => void;
  /**
   * Replace a topic wholesale (its text AND its people) — the editor edits a
   * whole card at once, so a field-by-field patch would just be ceremony.
   */
  updateContactEntry: (entryId: string, patch: Partial<Omit<ContactEntry, 'id'>>) => void;
  deleteContactEntry: (entryId: string) => void;
  /** Keep a topic out of the student directory without losing it. */
  setContactEntryHidden: (entryId: string, hidden: boolean) => void;
  /** Add a category. Its id is derived from the title, kept unique. */
  addContactGroup: (title: string) => void;
  renameContactGroup: (groupId: string, title: string) => void;
  /** Delete a category and every topic in it. */
  deleteContactGroup: (groupId: string) => void;

  // --- Campus Map (server-owned; every device shares one list) ---
  /** Latest server data (map pins + outlines). Null until the first fetch. */
  serverData: ServerData | null;
  /** Local edits exist that the server doesn't have (not signed in / proxy down). */
  dataSyncError: boolean;
  /**
   * An unsynced local edit was dropped because the server had newer data.
   * Sticky until dismissed: the edit is gone and the admin has to redo it.
   */
  dataConflictDiscarded: boolean;
  dismissConflictNotice: () => void;
  /**
   * The server refused this account's writes (not an admin, or the session
   * expired). Retrying can't fix it, so it must be reported as itself rather
   * than as an outage.
   */
  dataForbidden: boolean;
  /** Load cached server data instantly, then revalidate against the proxy. */
  syncServerData: () => Promise<void>;
  addPoi: (p: Omit<CampusPOI, 'id'>) => void;
  /** Edit any pin; the change goes straight into the shared server list. */
  updatePoi: (id: string, patch: Partial<CampusPOI>) => void;
  /** Really delete a pin, from the shared server list — no hidden, no restore. */
  deletePoi: (id: string) => void;
  /** Take a pin off the student map, restorably (how seed pins are "removed"). */
  setPoiHidden: (id: string, hidden: boolean) => void;

  addOutline: (o: Omit<CampusOutline, 'id'>) => void;
  updateOutline: (id: string, patch: Partial<CampusOutline>) => void;
  deleteOutline: (id: string) => void;
  setOutlineHidden: (id: string, hidden: boolean) => void;
  /** Internal: apply a server-data patch locally and push it to the proxy. */
  _pushData: (fn: (base: ServerData) => Partial<ServerData>) => void;

  setLiveSchedule: (days: Record<string, LiveDay>) => void;
  /** Time-travel for demos: pass ms-offset from real now, or 0 for real time. */
  setClockOffsetMs: (ms: number) => void;

}

const DEFAULT_PROFILE: Profile = {
  gradYear: null,
  name: '',
  email: '',
  onboarded: false,
};

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  announcements: true,
  classChange: false,
  grades: false,
  bell: false, // opt-in: requesting notification permission is the user's call
};

const DEFAULT_ADMIN: AdminState = {
  pin: null,
  announcements: [],
  hiddenAnnouncementIds: [],
  alert: null,
  school: {},
  diningItems: [],
  hiddenDiningIds: [],
  diningEdits: {},
  dining: {},
  pois: [],
  hiddenPoiIds: [],
  poiEdits: {},
  outlines: [],
  hiddenOutlineIds: [],
  outlineEdits: {},
};

/** Monotonic-ish local id without Date.now (kept deterministic-friendly). */
let idSeq = 0;
function localId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}-${Math.round(performance.now())}`;
}

/**
 * Serializes every shared-data write. Without it, two edits made a moment apart
 * each read the server before either has written, and the second silently
 * overwrites the first.
 */
let pushQueue: Promise<void> = Promise.resolve();

/**
 * An id that stays the same when a mutation is retried after a conflict.
 * Minting it inside the mutation would hand the retry a NEW id, so an "add"
 * replayed on data that already contains it becomes a duplicate item shipped
 * to every device.
 */
function stableId(prefix: string): () => string {
  let id: string | null = null;
  return () => (id ??= localId(prefix));
}

function withHidden(list: string[], id: string, hidden: boolean): string[] {
  const set = new Set(list);
  if (hidden) set.add(id);
  else set.delete(id);
  return [...set];
}

/**
 * Give every person in a contact topic an id. The editor mints ids for rows it
 * adds; this backstops anything that arrives without one, so a later edit can
 * still address the right row.
 */
function stampEntry(e: ContactEntry): ContactEntry {
  return {
    ...e,
    contacts: e.contacts?.map((c) => (c.id ? c : { ...c, id: localId('person') })),
  };
}

/** The shared lists: server data when we have it, seed+local overlay as the offline fallback. */
// Pins are admin-created only: the server list is the truth, and offline the
// last synced copy (serverData comes from the on-device cache) still serves.
// Outlines keep their seed: those footprints were hand-drawn by the school.
function basePois(d: ServerData | null | undefined): CampusPOI[] {
  return d?.pois ?? [];
}
function baseOutlines(d: ServerData | null | undefined, admin: AdminState): CampusOutline[] {
  return d?.outlines?.length ? d.outlines : mergeOutlines(SEED_OUTLINES, admin);
}

/** Server-owned content with the seed+local overlay as offline fallback. Pages use these. */
export function effectiveAnnouncements(
  serverData: ServerData | null,
  admin: AdminState,
  grade: number | null,
  { includeHidden = false } = {},
): Announcement[] {
  if (!serverData?.announcements) return mergeAnnouncements(SEED_ANNOUNCEMENTS, admin, grade);
  return serverData.announcements
    .filter((a) => includeHidden || !a.hidden)
    .filter((a) => a.audience === null || a.audience === grade)
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
}
/**
 * Live-calendar events with the admin's shared overrides applied (renames, new
 * times, field locations, and the game-location badge). Pure so every surface —
 * athletics page, calendar, admin editor — shows the same edited event.
 */
export function applyAthleticsEdits(
  events: SchoolEvent[],
  serverData: ServerData | null,
  { includeHidden = false } = {},
): SchoolEvent[] {
  const edits = serverData?.eventEdits;
  if (!edits) return includeHidden ? events : events.filter((e) => !e.hidden);
  return events
    .map((e) => {
      const edit = edits[e.id];
      if (!edit) return e;
      return {
        ...e,
        title: edit.title || e.title,
        time: edit.time || e.time,
        location: edit.location || e.location,
        venue: edit.venue || e.venue,
        hidden: edit.hidden || undefined,
      };
    })
    .filter((e) => includeHidden || !e.hidden);
}
export function effectiveDiningItems(
  serverData: ServerData | null,
  admin: AdminState,
  { includeHidden = false } = {},
): MenuItem[] {
  if (!serverData?.diningItems) return mergeDiningItems(DINING_MENU, admin, { includeHidden });
  return serverData.diningItems.filter((i) => includeHidden || !i.hidden);
}
/**
 * Admin notices: page info boxes plus the school-wide banner ('*'). The legacy
 * single `alert` field folds in as a banner notice, so a banner raised before
 * this system existed still shows and edits like any other notice.
 */
export function effectiveNotices(serverData: ServerData | null, admin: AdminState): PageNotice[] {
  const notices = serverData?.notices ?? [];
  const legacy = serverData ? (serverData.alert ?? null) : admin.alert;
  if (!legacy?.message.trim()) return notices;
  return [{ id: 'legacy-alert', page: '*', message: legacy.message, tone: legacy.tone }, ...notices];
}
export function effectivePrayers(
  serverData: ServerData | null,
  { includeHidden = false } = {},
): Prayer[] {
  const prayers = serverData?.prayers ?? SEED_PRAYERS;
  return prayers.filter((p) => includeHidden || !p.hidden);
}
/**
 * The contact directory every device shows: the server's copy once an admin has
 * published one, otherwise the seed bundled with the app.
 */
export function effectiveContacts(
  serverData: ServerData | null,
  { includeHidden = true } = {},
): ContactGroup[] {
  const groups = serverData?.contactGroups ?? CONTACT_GROUPS;
  if (includeHidden) return groups;
  return groups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => !e.hidden) }))
    .filter((g) => g.entries.length > 0);
}
/** The map pins/outlines a device shows; hidden ones are admin-only. */
export function effectivePois(
  serverData: ServerData | null,
  admin: AdminState,
  { includeHidden = false } = {},
): CampusPOI[] {
  return basePois(serverData).filter((p) => includeHidden || !p.hidden);
}
export function effectiveOutlines(
  serverData: ServerData | null,
  admin: AdminState,
  { includeHidden = false } = {},
): CampusOutline[] {
  return baseOutlines(serverData, admin).filter((o) => includeHidden || !o.hidden);
}
export function effectiveDining(serverData: ServerData | null, admin: AdminState): DiningOverrides {
  return serverData?.dining ?? admin.dining;
}
/** School contact/link overrides (attendance phone, Aeries URL): server-owned. */
export function effectiveSchool(serverData: ServerData | null, admin: AdminState): SchoolOverrides {
  return serverData?.school ?? admin.school;
}
/** A building's display name: the label set on its outline in the admin map editor, if any. */
export function effectiveBuildingName(
  serverData: ServerData | null,
  admin: AdminState,
  code: string,
): string | null {
  return effectiveOutlines(serverData, admin).find((o) => o.building === code)?.label ?? null;
}

/**
 * Schedule writes land on the active canvas — and, on a parent device with a
 * child selected, mirror into that child's own slot so each child keeps their
 * own schedule.
 */
function withActiveSchedule(s: AppState, schedule: PersonalSchedule): Partial<AppState> {
  return s.userRole === 'parent' && s.activeChildId
    ? { schedule, childSchedules: { ...s.childSchedules, [s.activeChildId]: schedule } }
    : { schedule };
}

/**
 * The class year of whoever's schedule is on screen: the student's own, or on a
 * parent device the child they're currently viewing. Everything grade-dependent
 * must read this rather than `profile.gradYear` — a parent device has no
 * profile year of its own, so grade-limited periods and split-mass columns
 * would otherwise be wrong for every child.
 */
export function useViewerGradYear(): number | null {
  return useAppStore((s) => {
    if (s.userRole === 'parent' && s.activeChildId) {
      return s.parentChildren.find((c) => c.id === s.activeChildId)?.gradYear ?? null;
    }
    return s.profile.gradYear;
  });
}

/**
 * localStorage for the persisted profile, but a write that fails must never
 * take the sign-in with it.
 *
 * This slice is a couple of kilobytes; the server-data cache next to it
 * ('smchs-server-data') holds the whole shared content blob and can grow to
 * most of the ~5MB budget. When it did, `setItem` here started throwing
 * QuotaExceededError — zustand doesn't catch that, so the write that should
 * have saved a fresh staff sign-in was lost, and the next launch came up
 * signed out with no error anywhere. Evicting the cache (which any fetch
 * rebuilds) to keep the profile is the right trade every time.
 */
const resilientStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Out of room (or blocked). Drop the rebuildable cache and try once more
      // — the profile is the one thing here that cannot be re-fetched.
      try {
        discardCache();
        localStorage.setItem(name, value);
      } catch {
        // Storage is genuinely unavailable (private mode, disabled). Nothing
        // more to do: the app still runs, it just can't remember this launch.
      }
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // storage unavailable: nothing to remove
    }
  },
}));

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      userRole: null,
      staffProfile: null,
      rememberedStudent: null,
      rememberedStaff: null,
      parentChildren: [],
      childSchedules: {},
      activeChildId: null,
      stashedStudentSchedule: null,
      schedule: {},
      notifications: DEFAULT_NOTIFICATIONS,
      admin: DEFAULT_ADMIN,
      serverData: null,
      dataSyncError: false,
      dataConflictDiscarded: false,
      dataForbidden: false,
      adminUnlocked: false,
      portalUser: null,
      staffSessionExpired: false,
      liveSchedule: {},
      liveScheduleLoaded: false,
      clockOffsetMs: 0,
      hydrated: false,

      signInStudent: (name, email, gradYear) =>
        set((s) => {
          const n = name.trim();
          const e = email.trim();
          // A different student on this device must not inherit the previous
          // one's classes, teachers and rooms — and their buildings decide the
          // lunch track, so the schedule would be wrong as well as private.
          const sameStudent =
            Boolean(e) && e.toLowerCase() === (s.rememberedStudent?.email ?? '').toLowerCase();
          return {
            profile: { ...s.profile, gradYear, name: n, email: e, onboarded: true },
            userRole: 'student' as const,
            rememberedStudent: { name: n, email: e, gradYear },
            ...(sameStudent ? {} : { schedule: {} }),
          };
        }),

      signOutStudent: () =>
        set((s) => ({
          // Snapshot the profile as it stands (settings edits included) so the
          // welcome screen can offer "Are you {name}?" next time.
          rememberedStudent:
            s.profile.name || s.profile.email
              ? { name: s.profile.name, email: s.profile.email, gradYear: s.profile.gradYear }
              : s.rememberedStudent,
          profile: DEFAULT_PROFILE,
          userRole: null,
        })),

      chooseStaff: () => set(() => ({ userRole: 'staff' as const })),

      signInStaff: (staff) =>
        set(() => ({
          staffProfile: staff,
          rememberedStaff: staff,
          userRole: 'staff' as const,
          portalUser: { name: staff.name, email: staff.email, role: staff.portal },
          adminUnlocked: true,
          staffSessionExpired: false,
        })),

      setStaffSessionExpired: (expired) => set(() => ({ staffSessionExpired: expired })),

      restoreStaffSession: (staff) =>
        set((s) =>
          // Someone signed in here since the sweep — their device now, leave it.
          s.staffProfile || s.userRole !== null
            ? {}
            : {
                staffProfile: staff,
                rememberedStaff: staff,
                userRole: 'staff' as const,
                portalUser: { name: staff.name, email: staff.email, role: staff.portal },
                adminUnlocked: true,
                staffSessionExpired: false,
              },
        ),

      signOutStaff: () => {
        clearSessionToken(); // drop the server session with the local one
        set(() => ({
          staffProfile: null,
          userRole: null,
          portalUser: null,
          adminUnlocked: false,
          staffSessionExpired: false,
        }));
      },

      chooseParent: () =>
        set((s) => ({
          userRole: 'parent' as const,
          activeChildId: null,
          // Park the student's schedule so child schedules never mix with it.
          stashedStudentSchedule: s.stashedStudentSchedule ?? s.schedule,
          schedule: {},
        })),

      addParentChild: (name, gradYear = null) =>
        set((s) => ({
          parentChildren: [
            ...s.parentChildren,
            { id: localId('child'), name: name.trim(), gradYear },
          ],
        })),

      updateParentChild: (id, patch) =>
        set((s) => ({
          parentChildren: s.parentChildren.map((c) => (c.id === id ? { ...c, ...patch, id } : c)),
        })),

      deleteParentChild: (id) =>
        set((s) => {
          const childSchedules = { ...s.childSchedules };
          delete childSchedules[id];
          return {
            parentChildren: s.parentChildren.filter((c) => c.id !== id),
            childSchedules,
            ...(s.activeChildId === id ? { activeChildId: null, schedule: {} } : {}),
          };
        }),

      selectParentChild: (id) =>
        set((s) => ({
          activeChildId: id,
          schedule: s.childSchedules[id] ?? {},
        })),

      signOutParent: () =>
        set((s) => ({
          userRole: null,
          activeChildId: null,
          // Children and their schedules stay for next time; the student's own
          // schedule canvas comes back.
          schedule: s.stashedStudentSchedule ?? {},
          stashedStudentSchedule: null,
        })),

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      setClass: (periodNumber, patch) =>
        set((s) =>
          withActiveSchedule(s, {
            ...s.schedule,
            [periodNumber]: { ...s.schedule[periodNumber], ...patch },
          }),
        ),

      clearClass: (periodNumber) =>
        set((s) => {
          const next = { ...s.schedule };
          delete next[periodNumber];
          return withActiveSchedule(s, next);
        }),

      setNotificationPref: (key, on) =>
        set((s) => ({ notifications: { ...s.notifications, [key]: on } })),

      importSchedule: (schedule) => set((s) => withActiveSchedule(s, schedule)),

      resetAll: () => {
        // The compliance-grade "delete all my data": every profile, schedule,
        // and remembered-identity byte on this device goes. That has to include
        // the credentials — a staff token left behind can still rewrite
        // school-wide content, and the passcode still unlocks /admin.
        clearSessionToken();
        discardCache();
        set(() => ({
          profile: DEFAULT_PROFILE,
          userRole: null,
          staffProfile: null,
          rememberedStudent: null,
          rememberedStaff: null,
          parentChildren: [],
          childSchedules: {},
          activeChildId: null,
          stashedStudentSchedule: null,
          portalUser: null,
          adminUnlocked: false,
          staffSessionExpired: false,
          admin: DEFAULT_ADMIN,
          serverData: null,
          schedule: {},
          notifications: DEFAULT_NOTIFICATIONS,
        }));
      },

      // --- Admin ---
      unlockAdmin: (pin) => {
        const entered = pin.trim();
        if (!entered) return false;
        const current = useAppStore.getState().admin.pin;
        if (current === null) {
          // First use: this passcode becomes the admin pin.
          set((s) => ({ admin: { ...s.admin, pin: entered }, adminUnlocked: true }));
          return true;
        }
        if (current === entered) {
          set(() => ({ adminUnlocked: true }));
          return true;
        }
        return false;
      },

      lockAdmin: () => set(() => ({ adminUnlocked: false, portalUser: null })),

      setAdminPin: (pin) => set((s) => ({ admin: { ...s.admin, pin: pin.trim() || null } })),

      setPortalUser: (user) => set(() => ({ portalUser: user, adminUnlocked: user !== null })),

      addAnnouncement: (a) =>
        ((nextId) =>
          get()._pushData((b) => ({
            announcements: [
              { ...a, id: nextId() },
              ...effectiveAnnouncements(b, get().admin, null, { includeHidden: true }),
            ],
          })))(stableId('ann')),

      updateAnnouncement: (id, patch) =>
        get()._pushData((b) => ({
          announcements: effectiveAnnouncements(b, get().admin, null, { includeHidden: true }).map((x) =>
            x.id === id ? { ...x, ...patch, id } : x,
          ),
        })),

      deleteAnnouncement: (id) =>
        get()._pushData((b) => ({
          announcements: effectiveAnnouncements(b, get().admin, null, { includeHidden: true }).filter(
            (x) => x.id !== id,
          ),
        })),

      setAnnouncementHidden: (id, hidden) =>
        get()._pushData((b) => ({
          announcements: effectiveAnnouncements(b, get().admin, null, { includeHidden: true }).map((x) =>
            x.id === id ? { ...x, hidden } : x,
          ),
        })),

      setScheduleDay: (iso, day) =>
        get()._pushData((b) => ({ scheduleDays: { ...(b.scheduleDays ?? {}), [iso]: day } })),

      clearScheduleDay: (iso) =>
        get()._pushData((b) => {
          const next = { ...(b.scheduleDays ?? {}) };
          delete next[iso];
          return { scheduleDays: next };
        }),

      // Admin-authored calendar events live on the shared server list, like
      // athletics events: every device sees a posted event.
      addEvent: (e) =>
        ((nextId) => get()._pushData((b) => ({ events: [...(b.events ?? []), { ...e, id: nextId() }] })))(
          stableId('evt'),
        ),

      updateEvent: (id, patch) =>
        get()._pushData((b) => ({
          events: (b.events ?? []).map((e) => (e.id === id ? { ...e, ...patch, id } : e)),
        })),

      deleteEvent: (id) =>
        get()._pushData((b) => ({ events: (b.events ?? []).filter((e) => e.id !== id) })),

      setEventHidden: (id, hidden) =>
        get()._pushData((b) => ({
          events: (b.events ?? []).map((e) => (e.id === id ? { ...e, hidden: hidden || undefined } : e)),
        })),

      updateAthleticsEvent: (id, patch) =>
        get()._pushData((b) => {
          const prev = b.eventEdits?.[id] ?? {};
          const merged: AthleticsEventEdit = { ...prev, ...patch };
          // Blank fields mean "back to the feed's value" — drop them so the
          // edit record only holds real overrides.
          for (const k of ['title', 'time', 'location', 'venue'] as const) {
            if (!merged[k]?.trim()) delete merged[k];
          }
          if (!merged.hidden) delete merged.hidden;
          const eventEdits = { ...(b.eventEdits ?? {}) };
          if (Object.keys(merged).length === 0) delete eventEdits[id];
          else eventEdits[id] = merged;
          return { eventEdits };
        }),

      addAthleticsEvent: (e) =>
        ((nextId) => get()._pushData((b) => ({ events: [...(b.events ?? []), { ...e, id: nextId() }] })))(
          stableId('sev'),
        ),

      deleteAthleticsEvent: (id) =>
        get()._pushData((b) => {
          if ((b.events ?? []).some((x) => x.id === id)) {
            const eventEdits = { ...(b.eventEdits ?? {}) };
            delete eventEdits[id];
            return { events: (b.events ?? []).filter((x) => x.id !== id), eventEdits };
          }
          return { eventEdits: { ...(b.eventEdits ?? {}), [id]: { ...(b.eventEdits?.[id] ?? {}), hidden: true } } };
        }),

      // --- Notices (server-owned) ---
      // Every write starts from effectiveNotices, so a legacy `alert` banner is
      // folded into the list, then `alert` is cleared: one system from then on.
      addNotice: (n) =>
        ((nextId) =>
          get()._pushData((b) => ({
            notices: [...effectiveNotices(b, get().admin), { ...n, id: nextId() }],
            alert: null,
          })))(stableId('ntc')),

      updateNotice: (id, patch) =>
        get()._pushData((b) => ({
          notices: effectiveNotices(b, get().admin).map((x) =>
            x.id === id ? { ...x, ...patch, id } : x,
          ),
          alert: null,
        })),

      deleteNotice: (id) =>
        get()._pushData((b) => ({
          notices: effectiveNotices(b, get().admin).filter((x) => x.id !== id),
          alert: null,
        })),

      setSchoolOverride: (patch) =>
        get()._pushData((b) => ({ school: { ...effectiveSchool(b, get().admin), ...patch } })),

      resetAdmin: () => set((s) => ({ admin: { ...DEFAULT_ADMIN, pin: s.admin.pin } })),

      // --- Campus Dining (server-owned) ---
      addDiningItem: (item) =>
        ((nextId) =>
          get()._pushData((b) => ({
            diningItems: [
              ...effectiveDiningItems(b, get().admin, { includeHidden: true }),
              { ...item, id: nextId() },
            ],
          })))(stableId('dish')),

      updateDiningItem: (id, patch) =>
        get()._pushData((b) => ({
          diningItems: effectiveDiningItems(b, get().admin, { includeHidden: true }).map((x) =>
            x.id === id ? { ...x, ...patch, id } : x,
          ),
        })),

      deleteDiningItem: (id) =>
        get()._pushData((b) => ({
          diningItems: effectiveDiningItems(b, get().admin, { includeHidden: true }).filter((x) => x.id !== id),
        })),

      setDiningItemHidden: (id, hidden) =>
        get()._pushData((b) => ({
          diningItems: effectiveDiningItems(b, get().admin, { includeHidden: true }).map((x) =>
            x.id === id ? { ...x, hidden } : x,
          ),
        })),

      setDiningOverride: (patch) =>
        get()._pushData((b) => ({ dining: { ...effectiveDining(b, get().admin), ...patch } })),

      // --- Prayer book (server-owned) ---
      addPrayer: (p) =>
        ((nextId) =>
          get()._pushData((b) => ({
            prayers: [...effectivePrayers(b, { includeHidden: true }), { ...p, id: nextId() }],
          })))(stableId('prayer')),

      updatePrayer: (id, patch) =>
        get()._pushData((b) => ({
          prayers: effectivePrayers(b, { includeHidden: true }).map((x) =>
            x.id === id ? { ...x, ...patch, id } : x,
          ),
        })),

      deletePrayer: (id) =>
        get()._pushData((b) => ({
          prayers: effectivePrayers(b, { includeHidden: true }).filter((x) => x.id !== id),
        })),

      reorderPrayers: (ids) =>
        get()._pushData((b) => {
          const list = effectivePrayers(b, { includeHidden: true });
          const byId = new Map(list.map((p) => [p.id, p]));
          const next = ids.flatMap((id) => byId.get(id) ?? []);
          // Race safety: anything the server has that this order missed stays, at the end.
          for (const p of list) if (!ids.includes(p.id)) next.push(p);
          return { prayers: next };
        }),

      // --- Contact directory (server-owned) ---
      // Every mutation rewrites the whole directory and pushes it, like the
      // prayer book: it's a few kilobytes, and one list keeps group order,
      // topic order, and the people inside a topic consistent for everyone.
      addContactEntry: (groupId, entry) =>
        ((nextId) =>
          get()._pushData((b) => {
            const id = `${groupId}-${contactSlug(entry.topic)}-${nextId()}`;
            return {
              contactGroups: effectiveContacts(b).map((g) =>
                g.id === groupId
                  ? { ...g, entries: [...g.entries, stampEntry({ ...entry, id })] }
                  : g,
              ),
            };
          }))(stableId('c')),

      updateContactEntry: (entryId, patch) =>
        get()._pushData((b) => ({
          contactGroups: effectiveContacts(b).map((g) => ({
            ...g,
            entries: g.entries.map((e) =>
              e.id === entryId ? stampEntry({ ...e, ...patch, id: entryId }) : e,
            ),
          })),
        })),

      deleteContactEntry: (entryId) =>
        get()._pushData((b) => ({
          contactGroups: effectiveContacts(b).map((g) => ({
            ...g,
            entries: g.entries.filter((e) => e.id !== entryId),
          })),
        })),

      setContactEntryHidden: (entryId, hidden) =>
        get()._pushData((b) => ({
          contactGroups: effectiveContacts(b).map((g) => ({
            ...g,
            entries: g.entries.map((e) =>
              e.id === entryId ? { ...e, hidden: hidden || undefined } : e,
            ),
          })),
        })),

      addContactGroup: (title) =>
        ((nextId) =>
          get()._pushData((b) => {
            const groups = effectiveContacts(b);
            const base = contactSlug(title) || 'group';
            // A second "Athletics" must not collide with the first one's id.
            const id = groups.some((g) => g.id === base) ? `${base}-${nextId()}` : base;
            return { contactGroups: [...groups, { id, title: title.trim(), entries: [] }] };
          }))(stableId('g')),

      renameContactGroup: (groupId, title) =>
        get()._pushData((b) => ({
          contactGroups: effectiveContacts(b).map((g) =>
            g.id === groupId ? { ...g, title: title.trim() } : g,
          ),
        })),

      deleteContactGroup: (groupId) =>
        get()._pushData((b) => ({
          contactGroups: effectiveContacts(b).filter((g) => g.id !== groupId),
        })),

      // --- Campus Map (server-owned) ---
      // Every mutation edits the shared list and pushes it; the push is
      // fire-and-forget (the next successful push carries any missed change).
      // ponytail: no offline push queue — if the proxy is down the change lives
      // in this device's cache until the next edit syncs it.
      syncServerData: async () => {
        const cached = readCache();
        if (cached) set({ serverData: cached.data });
        // Unsynced local edits push BEFORE the server copy is allowed to
        // overwrite them.
        if (cached?.dirty) {
          const result = await pushServerData(cached.data);
          set({ dataSyncError: result !== 'ok' });
          if (result === 'conflict') {
            // Someone else wrote since this snapshot was taken. Their newer
            // data wins — pushing ours anyway is how a phone waking up with an
            // old unsynced copy erased a fresh schedule edit. Drop the local
            // copy and re-adopt the server's.
            //
            // This DISCARDS whatever was in the local copy, so it must be
            // visible: clearing the error here told the admin everything was
            // fine while their edit was thrown away.
            discardCache();
            const fresh = await fetchServerData();
            if (fresh) set({ serverData: fresh });
            set({ dataSyncError: false, dataConflictDiscarded: true });
            return;
          }
          if (result === 'forbidden') {
            // Keep the edit (the admin may sign in as someone authorized), but
            // stop claiming it will sync on its own.
            set({ dataForbidden: true });
            return;
          }
          if (result === 'error') {
            // Signed in: the server is just down — keep the local copy and
            // retry on the next poll.
            if (getSessionToken()) return;
            // Any device with the admin editors open keeps its edits: the
            // editor promises they sync after sign-in, and discarding here is
            // how a passcode-only admin session lost its work. `adminUnlocked`
            // is the real test — an admin who onboarded as a student still has
            // the editors, and their userRole is not 'staff'.
            if (get().adminUnlocked || get().userRole === 'staff') return;
            // Anyone else can never push. Re-adopt the server copy rather than
            // forking forever — a device stuck on stale data beats a permanent
            // split-brain.
            discardCache();
            const fresh = await fetchServerData();
            if (fresh) set({ serverData: fresh, dataSyncError: false });
            return;
          }
        }
        const fresh = await fetchServerData();
        if (fresh) set({ serverData: fresh });
      },

      addPoi: (p) =>
        ((nextId) => get()._pushData((b) => ({ pois: [...basePois(b), { ...p, id: nextId() }] })))(
          stableId('poi'),
        ),

      updatePoi: (id, patch) =>
        get()._pushData((b) => ({
          pois: basePois(b).map((x) => (x.id === id ? { ...x, ...patch, id } : x)),
        })),

      deletePoi: (id) => get()._pushData((b) => ({ pois: basePois(b).filter((x) => x.id !== id) })),

      setPoiHidden: (id, hidden) =>
        get()._pushData((b) => ({
          pois: basePois(b).map((x) =>
            x.id === id ? { ...x, hidden: hidden || undefined } : x,
          ),
        })),

      addOutline: (o) =>
        ((nextId) =>
          get()._pushData((b) => ({
            outlines: [...baseOutlines(b, get().admin), { ...o, id: nextId() }],
          })))(stableId('out')),

      updateOutline: (id, patch) =>
        get()._pushData((b) => ({
          outlines: baseOutlines(b, get().admin).map((x) => (x.id === id ? { ...x, ...patch, id } : x)),
        })),

      deleteOutline: (id) =>
        get()._pushData((b) => ({ outlines: baseOutlines(b, get().admin).filter((x) => x.id !== id) })),

      setOutlineHidden: (id, hidden) =>
        get()._pushData((b) => ({
          outlines: baseOutlines(b, get().admin).map((x) =>
            x.id === id ? { ...x, hidden: hidden || undefined } : x,
          ),
        })),

      _pushData: (fn) => {
        // Serialized: two quick edits must not interleave their read-modify-push
        // cycles, or the second one's fetch returns the first one's un-pushed
        // state and they race to overwrite each other.
        pushQueue = pushQueue.then(async () => {
          for (let attempt = 0; ; attempt++) {
            // Read-before-write: apply the mutation to the FRESHEST data, never
            // a stale local copy — that's how deleted content "comes back". The
            // exception is a pending unsynced edit: that one is still ours to
            // keep, so it stays the base until it actually reaches the server.
            const pending = readCache();
            const base = pending?.dirty
              ? pending.data
              : ((await fetchServerData()) ?? get().serverData ?? {});
            const next = { ...base, ...fn(base) };
            set({ serverData: next });
            cacheServerData(next); // survive restarts even if the push below fails
            const result = await pushServerData(next);
            // Conflict: someone else wrote between our read and our write. Drop
            // back to their version and re-apply this mutation on top, so both
            // edits survive instead of one silently overwriting the other.
            if (result === 'conflict' && attempt < 2) {
              discardCache();
              await fetchServerData();
              continue;
            }
            set({ dataSyncError: result !== 'ok', dataForbidden: result === 'forbidden' });
            return;
          }
        });
      },

      setLiveSchedule: (days) => set(() => ({ liveSchedule: days, liveScheduleLoaded: true })),

      dismissConflictNotice: () => set(() => ({ dataConflictDiscarded: false })),

      setClockOffsetMs: (ms) => set(() => ({ clockOffsetMs: ms })),

    }),
    {
      name: 'smchs-app-v1',
      storage: resilientStorage,
      // v13: hall passes, security portal, games, and on-device day-type
      // overrides removed; school overrides + admin events moved server-side.
      // v14: parent children carry their own class year.
      version: 14,
      // Never persist transient/session flags; everything else (incl. admin) persists.
      partialize: (s) => ({
        profile: s.profile,
        userRole: s.userRole,
        staffProfile: s.staffProfile,
        rememberedStudent: s.rememberedStudent,
        rememberedStaff: s.rememberedStaff,
        parentChildren: s.parentChildren,
        childSchedules: s.childSchedules,
        activeChildId: s.activeChildId,
        stashedStudentSchedule: s.stashedStudentSchedule,
        schedule: s.schedule,
        notifications: s.notifications,
        admin: s.admin,
      }),
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Partial<AppState> & { profile?: Record<string, unknown> };
        // v1→v2: backfill admin slice. v2→v3: drop period8, add lunch, and drop
        // admin day-type overrides that pointed at removed day types.
        const admin = { ...DEFAULT_ADMIN, ...(p.admin ?? {}) };
        const restProfile = { ...((p.profile ?? {}) as Record<string, unknown>) };
        delete restProfile.period8;
        // v4→v5: lunch is no longer a stored setting. It's derived from the
        // building of the student's 3rd-period class. Drop any persisted value.
        delete restProfile.lunch;
        const profile = { ...DEFAULT_PROFILE, ...restProfile } as Profile;
        // v6→v7: server-synced passes and the bell notification pref.
        // v10→v11: the homework planner was removed; drop its persisted tasks.
        delete (p as Record<string, unknown>).planner;
        const notifications = { ...DEFAULT_NOTIFICATIONS, ...(p.notifications ?? {}) };
        // v5→v6: "Who are you?" welcome. A device that already onboarded was a
        // student's; carry them straight through instead of re-asking.
        const userRole = p.userRole ?? (profile.onboarded ? 'student' : null);
        const rememberedStudent =
          p.rememberedStudent ??
          (profile.onboarded && (profile.name || profile.email)
            ? { name: profile.name, email: profile.email, gradYear: profile.gradYear }
            : null);
        // v8→v9: parent role added. v9→v10: per-child schedules + parent hub.
        const px = p as {
          parentChildren?: ParentChild[];
          childSchedules?: Record<string, PersonalSchedule>;
          activeChildId?: string | null;
          stashedStudentSchedule?: PersonalSchedule | null;
        };
        // v13→v14: children gained a class year. Existing ones get null, which
        // reads as "no class year set" and shows every grade's periods rather
        // than silently guessing one.
        const parentChildren = (px.parentChildren ?? []).map((c) => ({
          ...c,
          gradYear: c.gradYear ?? null,
        }));
        const childSchedules = px.childSchedules ?? {};
        const activeChildId = px.activeChildId ?? null;
        const stashedStudentSchedule = px.stashedStudentSchedule ?? null;
        return {
          ...p,
          profile,
          admin,
          notifications,
          userRole,
          rememberedStudent,
          parentChildren,
          childSchedules,
          activeChildId,
          stashedStudentSchedule,
        } as AppState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.hydrated = true;
        // A persisted staff sign-in survives restarts: restore the session bits
        // (portal identity + unlocked admin pages) so they boot straight in.
        //
        // This deliberately does NOT require a server token. It used to, and
        // that was the "reopening the app dumps me on the sign-in page" bug:
        // `staffProfile` persists, so AppShell still redirects to
        // /portal/<role>/, but PortalGate saw a null portalUser and rendered
        // the name-and-password form — signed in enough to be sent there,
        // not signed in enough to be let in. Any device that can't reach the
        // server (or whose session lapsed) landed there on every launch.
        //
        // The guard's original worry — an admin editing on a device whose
        // writes can't reach the server — is handled where it actually
        // belongs: syncServerData keeps such edits instead of discarding them,
        // and AdminGate's SyncWarning says out loud that they aren't syncing
        // and offers a re-sign-in. Losing the whole session was never the
        // right price for that warning.
        if (state.staffProfile) {
          const sp = state.staffProfile;
          state.portalUser = { name: sp.name, email: sp.email, role: sp.portal };
          state.adminUnlocked = true;
          // Assume good until the server says otherwise (AppShell checks on
          // launch). Starting pessimistic would flash "your sign-in expired"
          // at every offline launch.
          state.staffSessionExpired = false;
        } else if (state.userRole === 'staff') {
          // 'staff' with no profile is a half-finished welcome-screen choice:
          // someone tapped "Staff", never signed in, and closed the app. Left
          // as-is it suppresses onboarding (and once booted to the portal
          // chooser on every launch). Nobody is signed in here — forget the
          // choice so the device opens on home with the welcome screen.
          state.userRole = null;
        }
      },
    },
  ),
);
