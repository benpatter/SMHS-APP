/**
 * Campus buildings and the lunch each one is assigned to.
 *
 * At SMCHS lunch is not a student setting. It's determined by the building of
 * your 3rd-period class. Students on the "first lunch" buildings eat first; the
 * rest eat second. This mapping is the source of truth the schedule engine uses
 * to derive a student's lunch track from their personalized schedule.
 *
 * (Note: "all science classes" are first lunch regardless of building. That
 * refinement isn't modeled yet.)
 */
import type { LunchTrack } from '@/lib/types';

/** Buildings offered in the schedule editor's Building dropdown. */
export const BUILDINGS = ['A', 'B', 'C', 'G', 'S', 'T', 'R', 'Gym', 'Talon Dome', 'Library'] as const;

export type Building = (typeof BUILDINGS)[number];

/** Which lunch each building eats. See the school's lunch-by-building chart. */
const BUILDING_LUNCH: Record<string, LunchTrack> = {
  // First Lunch
  B: 'first', // Crean Hall
  C: 'first', // Borchard Science Labs
  S: 'first', // Academic Services Center
  'Talon Dome': 'first',
  // Second Lunch
  A: 'second', // Lyon Hall
  T: 'second', // Trailers
  R: 'second', // Eagle Athletic Center
  Gym: 'second', // Moiso Family Pavilion
  G: 'second',
  Library: 'second',
};

/**
 * Live override of the lunch chart, derived from the school's scraped
 * lunch-by-building table (see AppShell). The static map above is the offline
 * fallback, so the schedule engine and the menu page always agree.
 */
let LIVE_LUNCH: Record<string, LunchTrack> | null = null;

/** Match one scraped place string ("Crean Hall (B)", "Library"…) to a code. */
function buildingCodeFor(place: string): string | null {
  const paren = place.match(/\(([A-Z][\w ]*)\)/);
  if (paren && BUILDING_LUNCH[paren[1]] !== undefined) return paren[1];
  for (const [code, name] of Object.entries(BUILDING_NAMES)) {
    if (place.toLowerCase().includes(name.toLowerCase())) return code;
  }
  const direct = (BUILDINGS as readonly string[]).find(
    (b) => b.toLowerCase() === place.trim().toLowerCase(),
  );
  return direct ?? null;
}

/** Fold the live lunch chart in; unmatched places are ignored (fallback wins). */
export function setLiveLunchChart(chart: { first: string[]; second: string[] } | null): void {
  if (!chart || (chart.first.length === 0 && chart.second.length === 0)) return;
  const map: Record<string, LunchTrack> = {};
  for (const place of chart.first) {
    const code = buildingCodeFor(place);
    if (code) map[code] = 'first';
  }
  for (const place of chart.second) {
    const code = buildingCodeFor(place);
    if (code) map[code] = 'second';
  }
  if (Object.keys(map).length > 0) LIVE_LUNCH = map;
}

/** The lunch a building eats, or null if the building is unknown/unset. */
export function lunchForBuilding(building?: string | null): LunchTrack | null {
  if (!building) return null;
  return LIVE_LUNCH?.[building] ?? BUILDING_LUNCH[building] ?? null;
}

/**
 * The school's proper name for each building, from the lunch-by-building chart.
 * Codes without a distinct proper name (Gym, Talon Dome, Library, G) map to
 * themselves.
 */
const BUILDING_NAMES: Record<string, string> = {
  A: 'Lyon Hall',
  B: 'Crean Hall',
  C: 'Borchard Science Labs',
  R: 'Eagle Athletic Center',
  S: 'Academic Services Center',
  T: 'Trailers',
  Gym: 'Moiso Family Pavilion',
};

/** Human label for a building, e.g. "Academic Services Center (S)" or "Library". */
export function buildingLabel(building?: string | null): string {
  if (!building) return '';
  const name = BUILDING_NAMES[building];
  return name ? `${name} (${building})` : building;
}

/** Short display name for a lunch track, e.g. "1st Lunch". */
export function lunchLabel(track: LunchTrack): string {
  return track === 'first' ? '1st Lunch' : '2nd Lunch';
}
