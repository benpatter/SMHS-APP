/**
 * Pure overlay merges: combine the built-in seed data with the on-device admin
 * overlay. Kept pure (admin state passed in) so the consuming pages can subscribe
 * to the store and re-render reactively when an administrator edits something.
 */
import type { Announcement } from '@/config/announcements.seed';
import type { MenuItem } from '@/config/dining.seed';
import type { CampusOutline, CampusPOI } from '@/config/campus3d/types';
import type { AdminState } from './store';

function newestFirst(a: Announcement, b: Announcement): number {
  return b.postedAt.localeCompare(a.postedAt);
}

/**
 * Seed + admin-authored announcements, minus hidden, filtered to all-school + the
 * student's grade, newest first.
 */
export function mergeAnnouncements(
  seed: Announcement[],
  admin: AdminState,
  grade: number | null,
): Announcement[] {
  const hidden = new Set(admin.hiddenAnnouncementIds);
  return [...admin.announcements, ...seed]
    .filter((a) => !hidden.has(a.id))
    .filter((a) => a.audience === null || a.audience === grade)
    .sort(newestFirst);
}


/**
 * The menu students see: seed + admin-added items, minus hidden, with per-item
 * admin edits (price changes etc.) applied by id. includeHidden lets the admin
 * editor show hidden items greyed out instead of vanishing them.
 */
export function mergeDiningItems(
  seed: MenuItem[],
  admin: AdminState,
  { includeHidden = false } = {},
): MenuItem[] {
  const hidden = new Set(admin.hiddenDiningIds);
  return [...seed, ...admin.diningItems]
    .filter((i) => includeHidden || !hidden.has(i.id))
    .map((i) => (admin.diningEdits[i.id] ? { ...i, ...admin.diningEdits[i.id], id: i.id } : i));
}



/**
 * The map outlines students see: seed building footprints + admin-drawn areas,
 * minus deleted, with per-outline edits (reshaped corners, labels) applied.
 */
export function mergeOutlines(
  seed: CampusOutline[],
  admin: AdminState,
  { includeHidden = false } = {},
): CampusOutline[] {
  const hidden = new Set(admin.hiddenOutlineIds);
  return [...seed, ...admin.outlines]
    .filter((o) => includeHidden || !hidden.has(o.id))
    .map((o) => (admin.outlineEdits[o.id] ? { ...o, ...admin.outlineEdits[o.id], id: o.id } : o));
}
