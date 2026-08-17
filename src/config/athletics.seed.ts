/**
 * Athletics seed: config-driven games. Sports-heavy school, so this earns a spot.
 * confirmWithSchool: live schedules feed. Until then these are clearly
 * labeled as a sample schedule in the UI.
 */
export interface Game {
  id: string;
  sport: string;
  level: 'Varsity' | 'JV' | 'Frosh';
  opponent: string;
  date: string; // yyyy-MM-dd
  time?: string;
  home: boolean;
  /** Admin-hidden (server-owned data): kept but not shown to students. */
  hidden?: boolean;
}

/**
 * Game schedules come from the school's live calendar (proxy → CalendarWiz,
 * athletics events) plus anything admins add on-device. No placeholder games:
 * this stays EMPTY so the app never shows fake-dated games.
 */
export const ATHLETICS_GAMES: Game[] = [];
