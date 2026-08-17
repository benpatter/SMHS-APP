/**
 * Geo-referencing for the site plan: converts campus world coordinates
 * ([x east, z south], ~meters, traced from the printed campus map) into real
 * lat/lng for the satellite map. The anchor, rotation, and scale were
 * calibrated visually against Esri World Imagery of the campus
 * (22062 Antonio Pkwy, Rancho Santa Margarita).
 */
import type { Building3D } from './types';

/** World point that sits on the geo anchor (center of the drawn campus). */
const WORLD_ANCHOR: [number, number] = [-16, 6];
/** Real-world position of the anchor point. */
const GEO_ANCHOR: [number, number] = [33.6435921, -117.5804334];
/** Clockwise rotation of the printed plan relative to true north, degrees. */
const PLAN_ROTATION = 0;
/** Plan units to meters. */
const PLAN_SCALE = 1;

const M_PER_DEG_LAT = 111320;

/** [x, z] world → [lat, lng]. */
export function worldToLatLng([x, z]: [number, number]): [number, number] {
  const ew = (x - WORLD_ANCHOR[0]) * PLAN_SCALE;
  const nw = -(z - WORLD_ANCHOR[1]) * PLAN_SCALE;
  const th = (PLAN_ROTATION * Math.PI) / 180;
  const east = ew * Math.cos(th) + nw * Math.sin(th);
  const north = nw * Math.cos(th) - ew * Math.sin(th);
  const lat = GEO_ANCHOR[0] + north / M_PER_DEG_LAT;
  const lng = GEO_ANCHOR[1] + east / (M_PER_DEG_LAT * Math.cos((GEO_ANCHOR[0] * Math.PI) / 180));
  return [lat, lng];
}

/** [lat, lng] → [x, z] world (inverse of worldToLatLng, for placing new pins). */
export function latLngToWorld([lat, lng]: [number, number]): [number, number] {
  const north = (lat - GEO_ANCHOR[0]) * M_PER_DEG_LAT;
  const east = (lng - GEO_ANCHOR[1]) * (M_PER_DEG_LAT * Math.cos((GEO_ANCHOR[0] * Math.PI) / 180));
  const th = (PLAN_ROTATION * Math.PI) / 180;
  const ew = east * Math.cos(th) - north * Math.sin(th);
  const nw = north * Math.cos(th) + east * Math.sin(th);
  return [ew / PLAN_SCALE + WORLD_ANCHOR[0], WORLD_ANCHOR[1] - nw / PLAN_SCALE];
}

/**
 * A building's ground-floor footprint as world [x, z] rings (one per plate),
 * applying the building's own plan rotation and position, exactly like the
 * 3D scenes do.
 */
export function buildingWorldRings(b: Building3D): [number, number][][] {
  const plates = b.floors[0].plates;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const plate of plates) {
    for (const [x, y] of plate) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const a = (-(b.rotation ?? 0) * Math.PI) / 180;
  return plates.map((plate) =>
    plate.map(([px, py]): [number, number] => {
      const lx = px - cx;
      const lz = py - cy;
      const wx = lx * Math.cos(a) + lz * Math.sin(a);
      const wz = -lx * Math.sin(a) + lz * Math.cos(a);
      return [b.position[0] + wx, b.position[1] + wz];
    }),
  );
}

/** The same footprint as lat/lng rings, for drawing on the satellite map. */
export function buildingFootprint(b: Building3D): [number, number][][] {
  return buildingWorldRings(b).map((ring) => ring.map(worldToLatLng));
}
