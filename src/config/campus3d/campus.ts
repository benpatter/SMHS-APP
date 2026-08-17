/**
 * The campus site plan for the 3D map, traced from the official smhs.org
 * Campus Map (Rev. 9-08-25). World units are roughly meters; x grows east,
 * z grows south, matching the printed map's orientation (Plano Trabuco at the
 * top, Antonio Parkway at the bottom). Positions are approximate; relative
 * placement matches the official map.
 */
import { INTERIORS } from './interiors';
import type { Building3D, GroundFeature, Landmark3D, Road } from './types';

/** Buildings that open into a floor-by-floor interior view. */
export const BUILDINGS_3D: Building3D[] = [
  {
    code: 'A',
    num: 2,
    name: 'Lyon Hall',
    tagline: 'Administration, attendance, nurse',
    position: [-38, 68],
    rotation: -8,
    floors: INTERIORS.A,
  },
  {
    code: 'B',
    num: 3,
    name: 'Crean Hall',
    tagline: 'Classrooms, 2 floors',
    position: [8, 78],
    floors: INTERIORS.B,
  },
  {
    code: 'C',
    num: 4,
    name: 'Borchard Science Labs',
    tagline: 'Science classrooms and labs',
    position: [46, 62],
    rotation: -40,
    floors: INTERIORS.C,
  },
  {
    code: 'D',
    num: 5,
    name: 'Borchard Library',
    tagline: 'Library, Tech Center, copy center',
    position: [26, 44],
    rotation: -40,
    floors: INTERIORS.D,
  },
  {
    code: 'G',
    num: 8,
    name: 'Caritas Christi Center',
    tagline: 'Campus Ministry, Wellness, classrooms, 3 floors',
    position: [62, 30],
    rotation: 6,
    floors: INTERIORS.G,
  },
  {
    code: 'S',
    num: 9,
    name: 'Academic Services Center',
    tagline: 'Counseling, ASP, ETV, eSports, Robotics, 2 floors',
    position: [52, -8],
    rotation: 22,
    floors: INTERIORS.S,
  },
  {
    code: 'R',
    num: 24,
    name: 'Eagle Athletic Center',
    tagline: 'Weight rooms, Dance Center, classrooms, 3 floors',
    position: [-64, -6],
    floors: INTERIORS.R,
  },
];

/** Structures without floor plans: rendered as sculpted massings. */
export const LANDMARKS_3D: Landmark3D[] = [
  { id: 'gym', num: 10, name: 'Moiso Family Pavilion', position: [24, -34], rotation: -18, size: [42, 30], height: 13, massing: 'box' },
  { id: 'dome', num: 15, name: 'Talon Dome', position: [-38, 8], size: [0, 0], radius: 11, height: 12, massing: 'dome' },
  { id: 'chapel', num: 6, name: 'Sacred Heart Chapel', position: [-4, 56], size: [10, 9], height: 9, massing: 'box' },
  { id: 'belltower', name: 'Bell Tower', position: [-13, 56], size: [3.5, 3.5], height: 16, massing: 'tower' },
  { id: 'pavilion', num: 11, name: 'Von der Ahe Pavilion', tagline: 'Lunch Shelter', position: [-4, 20], rotation: -28, size: [42, 14], height: 7, massing: 'canopy' } as Landmark3D,
  { id: 'arts', num: 16, name: 'Performing Arts', position: [-32, 38], rotation: -10, size: [18, 13], height: 9, massing: 'box' },
  { id: 'store', num: 7, name: 'Campus Store', position: [22, 26], size: [9, 8], height: 5, massing: 'box' },
  { id: 'grotto', num: 12, name: 'Strader Grotto', position: [4, -2], size: [10, 9], height: 4, massing: 'box' },
  { id: 'dining', name: 'Faculty Dining', position: [-16, 2], rotation: -30, size: [12, 10], height: 5, massing: 'box' },
  { id: 'facilities', num: 13, name: 'Facilities', position: [-38, -8], size: [12, 9], height: 5, massing: 'box' },
  { id: 'welcome', num: 1, name: 'Welcome Center', tagline: 'Security', position: [-22, 66], size: [8, 7], height: 5, massing: 'box' } as Landmark3D,
  { id: 'aquatics', num: 14, name: 'Eagle Aquatics Center', position: [26, -66], rotation: -18, size: [40, 22], height: 6, massing: 'box' },
  { id: 'lockers', name: 'Locker & Team Rooms', position: [-14, -48], rotation: -22, size: [20, 10], height: 6, massing: 'box' },
  // Context only: the parish next door.
  { id: 'parish-church', name: 'San Francisco Solano Parish', position: [34, 102], size: [26, 10], height: 8, massing: 'box', context: true },
  { id: 'parish-offices', name: 'Parish Offices', position: [28, 92], size: [18, 6], height: 5, massing: 'box', context: true },
];

/** Fields, courts, pools, parking pads. */
export const GROUNDS: GroundFeature[] = [
  { id: 'track', kind: 'track', shape: 'ellipse', position: [-104, -10], size: [42, 78], label: 'Turf Field & Track' },
  { id: 'turf', kind: 'turf', shape: 'ellipse', position: [-104, -10], size: [30, 62] },
  { id: 'upper-field', kind: 'grass', shape: 'rect', position: [-130, -12], size: [14, 70], label: 'Upper Field' },
  { id: 'jv-baseball', kind: 'grass', shape: 'fan', position: [-108, 42], size: [30, 30], rotation: 30, label: 'JV Baseball' },
  { id: 'varsity-baseball', kind: 'grass', shape: 'fan', position: [-102, 94], size: [34, 34], rotation: -40, label: 'Varsity Baseball' },
  { id: 'softball', kind: 'sand', shape: 'fan', position: [-116, -66], size: [28, 28], rotation: 120, label: 'Softball' },
  { id: 'beach-vb', kind: 'sand', shape: 'rect', position: [-126, 26], size: [10, 22], label: 'Beach Volleyball' },
  { id: 'tennis', kind: 'court', shape: 'rect', position: [-88, -58], size: [26, 22], rotation: 0, label: 'Tennis Courts' },
  { id: 'pool', kind: 'water', shape: 'rect', position: [26, -66], size: [34, 16], rotation: -18 },
  { id: 'quad', kind: 'plaza', shape: 'rect', position: [8, 14], size: [52, 46], rotation: -10 },
  { id: 'parking-s', kind: 'parking', shape: 'rect', position: [-30, 104], size: [70, 22], label: 'Student Parking' },
  { id: 'parking-staff', kind: 'parking', shape: 'rect', position: [16, 92], size: [50, 6], label: 'Staff Parking' },
  { id: 'parking-nw', kind: 'parking', shape: 'rect', position: [-88, -92], size: [50, 16], label: 'Student Parking' },
  { id: 'parking-n', kind: 'parking', shape: 'rect', position: [-38, -66], size: [24, 24], label: 'Staff & Visitor' },
];

/** Roads and fire lanes framing the campus. */
export const ROADS: Road[] = [
  {
    id: 'antonio',
    points: [
      [-150, 122],
      [110, 122],
    ],
    width: 10,
    label: 'Antonio Parkway',
  },
  {
    id: 'plano',
    points: [
      [-150, -108],
      [110, -108],
    ],
    width: 8,
    label: 'Plano Trabuco',
  },
  {
    id: 'lee-campus',
    points: [
      [-56, 112],
      [-56, 46],
      [-58, 10],
      [-56, -40],
      [-52, -100],
    ],
    width: 6,
    label: 'Lee Campus Drive',
  },
  {
    id: 'fire-lane-e',
    points: [
      [92, -80],
      [94, 40],
      [80, 84],
    ],
    width: 4,
    label: 'Fire Lane',
  },
];

/**
 * Building-picker entries: which 3D building each schedule "building" code
 * opens. Gym / Talon Dome / Library map to their landmark or building ids.
 */
export function findBuilding(code: string): Building3D | undefined {
  return BUILDINGS_3D.find((b) => b.code === code);
}
