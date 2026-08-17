/**
 * Seed announcements behind the swappable AnnouncementProvider. These stand in
 * for the real Microsoft Teams "Campus Life" channels (grades 9/10/11/12) plus
 * all-school, until the TeamsGraphProvider is wired up.
 *
 * `audience` of `null` means all-school; otherwise it's a grade level.
 */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** null = all-school, or 9 | 10 | 11 | 12. */
  audience: number | null;
  channel: string; // "Campus Life 11", "All-School", etc.
  author: string;
  postedAt: string; // ISO timestamp
  /** Optional deep link into the Teams channel. */
  teamsUrl?: string;
  /** Link to the full post (e.g. the smhs.org article). Makes the card clickable. */
  url?: string;
  /** Sanitized rich HTML body (live posts). Rendered on the post detail page. */
  bodyHtml?: string;
  /** Admin-hidden (server-owned data): kept but not shown to students. */
  hidden?: boolean;
}

/**
 * Announcements come from the live smhs.org feed (proxy → /api/weekly) plus
 * anything admins post on-device. No placeholder posts: this stays EMPTY so the
 * app never shows fake-dated announcements.
 */
export const SEED_ANNOUNCEMENTS: Announcement[] = [];
