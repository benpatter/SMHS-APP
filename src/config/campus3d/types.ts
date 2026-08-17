/** Shared types for the 3D campus map data model. */

/** Room categories, mirroring the legend on the official Classroom Locator. */
export type RoomType = 'classroom' | 'office' | 'restroom' | 'meeting' | 'open' | 'utility';

/**
 * One room on a floor plate. `rect` is [x, y, w, d] in the floor's local plan
 * coordinates (x grows east, y grows south, units are roughly meters, traced
 * from the Classroom Locator PDF). `rot` rotates the rect around its own
 * center, in degrees clockwise on the plan (used for Lyon Hall's angled wing).
 */
export interface Room3D {
  id: string;
  type: RoomType;
  rect: [number, number, number, number];
  label?: string;
  rot?: number;
}

/**
 * One floor: its plate outline polygon(s) in local plan coordinates plus the
 * rooms sitting on it. Multiple plates model detached bars (Science Labs) and
 * angled wings (Lyon Hall) without polygon unions.
 */
export interface Floor3D {
  name: string;
  plates: [number, number][][];
  rooms: Room3D[];
}

/** A building students can open floor-by-floor (has Classroom Locator data). */
export interface Building3D {
  code: string;
  /** Number on the official smhs.org campus map key (1 to 24). */
  num?: number;
  name: string;
  tagline?: string;
  /** World position of the building's plan center: [x, z]. */
  position: [number, number];
  /** Plan rotation in degrees, clockwise looking down at the map. */
  rotation?: number;
  /** Height of one story in world units. */
  floorHeight?: number;
  floors: Floor3D[];
}

/** A campus structure without floor detail: gyms, chapel, dome, pavilions. */
export interface Landmark3D {
  id: string;
  num?: number;
  name: string;
  position: [number, number];
  rotation?: number;
  /** Plan footprint [w, d]; ignored for `dome`, which uses `radius`. */
  size: [number, number];
  height: number;
  massing?: 'box' | 'dome' | 'tower' | 'canopy';
  radius?: number;
  /** Context structures (the parish next door) render muted and label-less. */
  context?: boolean;
}

/** Flat ground features: fields, courts, pools, parking. */
export interface GroundFeature {
  id: string;
  kind: 'grass' | 'turf' | 'sand' | 'track' | 'court' | 'water' | 'parking' | 'plaza';
  shape: 'rect' | 'ellipse' | 'fan';
  position: [number, number];
  size: [number, number];
  rotation?: number;
  label?: string;
}

/** A point of interest copied from the official SMHS app's location list. */
export interface CampusPOI {
  id: string;
  name: string;
  /** World [x, z] where the pin lands on the site plan. */
  position: [number, number];
  /** Detail line from the official app (which floor, etc.). */
  desc?: string;
  /** Building code whose interior viewer this POI opens. */
  building?: string;
  /** Hidden by an admin: kept off the student map until restored. */
  hidden?: boolean;
}

/**
 * A tappable outline drawn on the satellite map: the seed ones are building
 * footprints (from the floor plans); administrators can add their own areas.
 */
export interface CampusOutline {
  id: string;
  /** Polygon corners as world [x, z] points. */
  points: [number, number][];
  /** Building code whose interior viewer a tap opens. */
  building?: string;
  label?: string;
  /** Hidden by an admin: kept off the student map until restored. */
  hidden?: boolean;
}

/** Road ribbons drawn on the ground plane. */
export interface Road {
  id: string;
  /** Ribbon centerline as world [x, z] points. */
  points: [number, number][];
  width: number;
  label?: string;
}
