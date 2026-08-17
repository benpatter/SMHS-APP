/**
 * AnnouncementProvider: swappable source for Campus Life announcements.
 *
 * Today: MockAnnouncementProvider serves seed data filtered by the student's
 * grade (+ all-school). Later: TeamsGraphProvider reads the real Microsoft Teams
 * "Campus Life" channels via Microsoft Graph. The UI only knows the interface,
 * so swapping the implementation requires no UI changes.
 */
import { SEED_ANNOUNCEMENTS, type Announcement } from '@/config/announcements.seed';

export interface AnnouncementQuery {
  /** Student grade (9–12) or null if unknown. Controls which grade channel shows. */
  grade: number | null;
}

export interface AnnouncementProvider {
  readonly id: string;
  readonly isLive: boolean;
  list(query: AnnouncementQuery): Promise<Announcement[]>;
}

function sortNewestFirst(a: Announcement, b: Announcement): number {
  return b.postedAt.localeCompare(a.postedAt);
}

/** Serves seed data; filters to all-school + the student's grade channel. */
export class MockAnnouncementProvider implements AnnouncementProvider {
  readonly id = 'mock';
  readonly isLive = false;

  async list({ grade }: AnnouncementQuery): Promise<Announcement[]> {
    // Simulate a fast local read (cache-first; no network dependency).
    return SEED_ANNOUNCEMENTS.filter(
      (a) => a.audience === null || a.audience === grade,
    ).sort(sortNewestFirst);
  }
}

/**
 * Stub for the real integration. Documented shape for hooking up Microsoft Graph:
 *   GET /teams/{team-id}/channels/{channel-id}/messages
 * mapped per Campus Life grade channel. Throws until credentials/wiring exist so
 * it can never silently masquerade as live data.
 */
export class TeamsGraphAnnouncementProvider implements AnnouncementProvider {
  readonly id = 'teams-graph';
  readonly isLive = true;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async list(_query: AnnouncementQuery): Promise<Announcement[]> {
    throw new Error(
      'TeamsGraphAnnouncementProvider not configured. Wire up Microsoft Graph ' +
        '(Campus Life channel IDs + auth) before enabling.',
    );
  }
}

/** Single place to choose the active provider. */
export const announcementProvider: AnnouncementProvider = new MockAnnouncementProvider();
