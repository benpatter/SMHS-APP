/**
 * Floor-by-floor interiors for every building on the school's Classroom
 * Locator (Rev. 11-24-25). Geometry is traced from the locator PDF's floor
 * plans: coordinates are local plan units (about a meter), x grows east and
 * y grows south on each plan, exactly as printed. Room sizes are approximate
 * but adjacency, ordering, and room numbers match the official document.
 */
import type { Floor3D, Room3D, RoomType } from './types';

/** Compact room literal: rm(id, type, x, y, w, d, label?, rot?). */
function rm(
  id: string,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  d: number,
  label?: string,
  rot?: number,
): Room3D {
  return { id, type, rect: [x, y, w, d], label, rot };
}

/* ------------------------------------------------------------------ */
/* Lyon Hall "A" Building: one floor, admin offices plus an angled     */
/* wing of large classrooms (A142 / A152 / A153).                      */
/* ------------------------------------------------------------------ */

const A_MAIN: [number, number][] = [
  [0, -0.6],
  [33.5, -0.6],
  [33.5, 15.4],
  [0, 15.4],
];

// Hull around the rotated wing rooms (computed from their corners + margin).
const A_WING: [number, number][] = [
  [25.7, 15.1],
  [33.3, -0.4],
  [42.7, 9.7],
  [47.6, 28.0],
  [44.2, 31.4],
  [39.3, 28.1],
  [31.5, 22.7],
  [29.7, 20.6],
];

const A_FLOOR: Floor3D = {
  name: 'Ground Floor',
  plates: [A_MAIN, A_WING],
  rooms: [
    // North row, west to east.
    rm('A104', 'office', 0.3, 0.3, 2.5, 2.2),
    rm('A105', 'office', 2.9, 0.3, 1.8, 2.2),
    rm('A106', 'office', 4.7, 0.3, 1.7, 2.2),
    rm('A107', 'office', 6.4, 0.3, 1.8, 2.2),
    rm('A109', 'office', 9.6, 0.3, 3.2, 2.2),
    rm('A110', 'restroom', 12.9, -0.5, 3.0, 2.6, 'Restroom'),
    rm('A111', 'restroom', 16.2, -0.5, 2.9, 2.6, 'Restroom'),
    rm('A112', 'office', 19.3, 0.3, 1.5, 2.2),
    rm('A113', 'office', 20.8, 0.3, 1.6, 2.2),
    rm('A114', 'office', 22.4, 0.3, 1.7, 2.2),
    rm('A115', 'office', 24.1, 0.3, 1.7, 2.2),
    rm('A116', 'office', 26.9, 0.3, 1.5, 2.2),
    rm('A117', 'office', 28.4, 0.3, 1.7, 2.2),
    rm('A118', 'office', 30.1, 0.3, 1.6, 2.2),
    // Second row.
    rm('A103', 'utility', 0.2, 2.8, 2.5, 2.5),
    rm('A102C', 'office', 2.8, 3.8, 1.6, 2.0),
    rm('A102B', 'office', 4.4, 3.8, 1.7, 2.0),
    rm('A102A', 'office', 6.1, 3.8, 1.7, 2.0),
    rm('A108', 'utility', 9.7, 3.4, 3.0, 2.5),
    rm('A125', 'office', 13.3, 4.1, 2.6, 2.2),
    rm('A124', 'utility', 16.1, 4.1, 1.8, 2.2),
    rm('A123', 'office', 17.9, 4.1, 1.9, 2.2),
    rm('A122', 'office', 19.8, 4.1, 1.9, 2.2),
    rm('A121', 'office', 21.8, 4.1, 3.5, 2.2, 'Attendance'),
    rm('A119', 'office', 30.1, 3.4, 2.7, 2.2),
    // Main office suite and meeting rooms.
    rm('A100', 'office', 0.6, 6.3, 3.2, 2.5, 'Main Office'),
    rm('A101', 'meeting', 3.8, 6.3, 4.5, 2.5),
    rm('A141', 'meeting', 10.0, 5.9, 2.9, 3.7),
    // Nurse and health suite along the east corridor.
    rm('A-NURSE', 'open', 27.1, 4.6, 1.6, 7.4, 'Nurses'),
    rm('A-RR-119', 'restroom', 30.2, 5.7, 1.8, 1.5, 'Restroom'),
    rm('A120', 'utility', 28.8, 7.4, 3.2, 2.4),
    rm('A146', 'utility', 28.8, 11.9, 1.9, 1.9),
    rm('A-RR-146', 'restroom', 30.8, 11.8, 1.4, 1.5, 'Restroom'),
    // South rows, west to east.
    rm('A140', 'office', 0.3, 10.0, 2.4, 2.2),
    rm('A139', 'open', 2.7, 10.0, 6.1, 3.1),
    rm('A136', 'utility', 10.3, 9.7, 1.1, 2.5),
    rm('A135', 'utility', 11.4, 9.7, 1.2, 2.5),
    rm('A134', 'office', 13.1, 9.7, 2.2, 2.2),
    rm('A133', 'office', 15.3, 9.7, 2.2, 2.2),
    rm('A126', 'open', 19.1, 9.7, 6.5, 3.4),
    rm('A138', 'office', 0.3, 13.1, 2.8, 2.2),
    rm('A137', 'office', 3.1, 13.1, 5.7, 2.2),
    rm('A132', 'office', 10.6, 13.1, 2.8, 2.2),
    rm('A131', 'office', 13.4, 13.1, 3.2, 2.2),
    rm('A130', 'office', 17.8, 13.1, 2.2, 2.2),
    rm('A129', 'office', 20.0, 13.1, 1.6, 2.2),
    rm('A128', 'office', 21.6, 13.1, 1.7, 2.2),
    rm('A127', 'office', 23.3, 13.1, 1.7, 2.2),
    // Angled wing toward the chapel: junction rooms then the big classrooms.
    rm('A142A', 'office', 34.0, 4.2, 2.8, 2.0, undefined, 45),
    rm('A145', 'office', 31.9, 13.4, 2.5, 1.9, undefined, 45),
    rm('A147', 'meeting', 27.8, 14.4, 1.9, 2.2, undefined, 45),
    rm('A148', 'office', 28.9, 16.5, 2.8, 1.8, undefined, 45),
    rm('A151', 'office', 34.1, 15.6, 2.5, 1.9, undefined, 45),
    rm('A150', 'office', 31.9, 17.8, 2.5, 1.9, undefined, 45),
    rm('A149', 'office', 30.9, 19.7, 2.4, 1.9, undefined, 45),
    rm('A142', 'classroom', 33.8, 7.0, 7.0, 7.0, undefined, 45),
    rm('A152', 'classroom', 35.1, 17.6, 8.0, 8.0, undefined, 45),
    rm('A153', 'classroom', 40.6, 24.8, 5.5, 4.5, undefined, 45),
  ],
};

/* ------------------------------------------------------------------ */
/* Crean Hall "B" Building: two floors, an L of classrooms.            */
/* ------------------------------------------------------------------ */

const B_OUTLINE_1: [number, number][] = [
  [0, 0],
  [34, 0],
  [34, 7.8],
  [36, 7.8],
  [36, 9.9],
  [34, 9.9],
  [34, 24.4],
  [20.5, 24.4],
  [20.5, 9.7],
  [6.5, 9.7],
  [6.5, 15.9],
  [0, 15.9],
];

const B_FLOOR_1: Floor3D = {
  name: '1st Floor',
  plates: [B_OUTLINE_1],
  rooms: [
    rm('B-ARTYARD', 'open', 0, 0, 6.8, 2.2, 'Art Yard'),
    rm('B114B', 'utility', 6.8, 0.8, 2.0, 1.7),
    rm('B113B', 'office', 8.8, 0.8, 1.9, 1.7),
    rm('B114', 'classroom', 0, 2.5, 7.2, 5.8),
    rm('B113C', 'utility', 7.2, 2.5, 1.7, 2.2),
    rm('B113', 'classroom', 8.9, 2.5, 5.0, 5.9),
    rm('B112', 'classroom', 13.9, 2.5, 5.6, 5.9),
    rm('B111', 'classroom', 19.5, 2.5, 7.1, 5.9),
    rm('B110', 'classroom', 26.6, 2.5, 7.4, 5.9),
    rm('B127', 'office', 34.1, 8.0, 1.8, 1.8, 'Mail'),
    rm('B115', 'classroom', 0, 10.5, 5.9, 5.3),
    rm('B109', 'classroom', 21.3, 10.6, 5.3, 4.1),
    rm('B108', 'classroom', 28.1, 10.2, 5.9, 4.1),
    rm('B107', 'classroom', 28.1, 14.4, 5.9, 4.6),
    rm('B-STAIR-W1', 'utility', 0.5, 8.3, 3.2, 2.2, 'Stairs', 180),
    rm('B-STAIR-1', 'utility', 21.3, 16.7, 2.6, 2.2, 'Stairs'),
    rm('B-ELEV-1', 'utility', 25.6, 15.0, 1.5, 1.7, 'Elev'),
    rm('B-RR-M1', 'restroom', 28.8, 19.3, 5.2, 2.3, 'Restroom'),
    rm('B-RR-W1', 'restroom', 28.8, 21.8, 5.2, 2.3, 'Restroom'),
    rm('B105', 'classroom', 21.3, 19.1, 5.3, 5.3),
  ],
};

const B_OUTLINE_2: [number, number][] = [
  [0, 0],
  [34.4, 0],
  [34.4, 23.1],
  [20.5, 23.1],
  [20.5, 7.6],
  [6.5, 7.6],
  [6.5, 13.5],
  [0, 13.5],
];

const B_FLOOR_2: Floor3D = {
  name: '2nd Floor',
  plates: [B_OUTLINE_2],
  rooms: [
    rm('B219', 'classroom', 0, 0.5, 5.9, 4.9),
    rm('B218B', 'office', 5.9, 0.6, 2.1, 2.8),
    rm('B218A', 'office', 5.9, 3.4, 2.1, 2.8),
    rm('B217', 'classroom', 8, 0, 5.1, 5),
    rm('B216', 'office', 9.4, 5, 1.9, 1.8),
    rm('B215', 'office', 11.4, 5, 1.7, 1.8),
    rm('B214', 'classroom', 13.1, 1.3, 6.4, 5.0),
    rm('B213', 'office', 19.5, 0.6, 1.8, 5.6),
    rm('B212', 'classroom', 21.3, 1.3, 5.3, 5.0),
    rm('B210', 'classroom', 28.1, 1.3, 6.3, 4.4),
    rm('B208', 'classroom', 28.1, 6.3, 6.3, 5.3),
    rm('B207', 'classroom', 28.1, 11.6, 6.3, 5.3),
    rm('B209', 'classroom', 21.3, 7.5, 5.3, 5.6),
    rm('B-STAIR-W2', 'utility', 1.1, 5.4, 3.9, 2.5, 'Stairs'),
    rm('B-STAIR-2', 'utility', 21.8, 14.9, 2.6, 2.2, 'Stairs'),
    rm('B-ELEV-2', 'utility', 25.6, 13.3, 1.5, 1.7, 'Elev'),
    rm('B-RR-M2', 'restroom', 28.8, 17.5, 5.2, 2.4, 'Restroom'),
    rm('B-RR-W2', 'restroom', 28.8, 20.1, 5.2, 2.4, 'Restroom'),
    rm('B206', 'classroom', 21.3, 17.8, 5.3, 5.0),
    rm('B220', 'classroom', 0, 7.9, 5.9, 5.2),
  ],
};

/* ------------------------------------------------------------------ */
/* Borchard Science Labs "C" Building: two parallel lab bars.          */
/* ------------------------------------------------------------------ */

const C_FLOOR: Floor3D = {
  name: 'Ground Floor',
  plates: [
    [
      [0, 0],
      [39.2, 0],
      [39.2, 8.1],
      [0, 8.1],
    ],
    [
      [0, 10.8],
      [39.2, 10.8],
      [39.2, 23],
      [0, 23],
    ],
  ],
  rooms: [
    rm('C105', 'classroom', 0, 0.3, 11.4, 7.8),
    rm('C105A', 'office', 11.4, 0.3, 1.7, 6.9, 'Prep'),
    rm('C103', 'classroom', 13.1, 0.3, 11.9, 7.8),
    rm('C102A', 'office', 25.0, 0.3, 1.7, 6.9, 'Prep'),
    rm('C101', 'classroom', 26.7, 0.3, 12.2, 7.8),
    rm('C109', 'office', 7.5, 10.9, 6.7, 2.4),
    rm('C112', 'office', 17.5, 10.9, 12.2, 2.4),
    rm('C108', 'classroom', 0, 13.3, 7.8, 9.7),
    rm('C110', 'classroom', 7.8, 13.3, 7.8, 9.7),
    rm('C111', 'classroom', 15.6, 13.3, 8.1, 9.7),
    rm('C113', 'classroom', 23.7, 13.3, 8.2, 9.7),
    rm('C-RR-M', 'restroom', 31.9, 13.5, 3.6, 5.1, 'Restroom'),
    rm('C-RR-W', 'restroom', 35.5, 13.5, 3.7, 5.1, 'Restroom'),
  ],
};

/* ------------------------------------------------------------------ */
/* Borchard Library Tech Center "D" Building: one open floor.          */
/* ------------------------------------------------------------------ */

const D_FLOOR: Floor3D = {
  name: 'Ground Floor',
  plates: [
    [
      [4.4, 0],
      [30.6, 0],
      [30.6, 9.4],
      [42.2, 9.4],
      [42.2, 32.2],
      [4.4, 32.2],
    ],
    [
      [0, 8.9],
      [4.4, 8.9],
      [4.4, 23.3],
      [0, 23.3],
    ],
  ],
  rooms: [
    rm('D106', 'office', 4.9, 0.6, 9.8, 8.6, 'Teacher Workroom'),
    rm('D-RR', 'restroom', 16.4, 0.4, 3.1, 2.6, 'Restroom'),
    rm('D109', 'utility', 14.7, 5.3, 4.7, 5.0, 'Copy Center'),
    rm('D-TECH', 'open', 20.6, 0.6, 9.4, 8.4, 'Tech Center'),
    rm('D105', 'office', 0.2, 9.2, 4.0, 5.6),
    rm('D104', 'office', 0.2, 18.3, 4.0, 5.0),
    rm('D101', 'open', 5.4, 10.4, 35.6, 12.4, 'Main Library'),
    rm('D103', 'classroom', 4.9, 23.3, 8.3, 8.4),
    rm('D102', 'meeting', 13.2, 23.3, 8.6, 8.4),
    rm('D101M', 'meeting', 21.8, 23.3, 8.3, 8.4, 'D101'),
  ],
};

/* ------------------------------------------------------------------ */
/* Caritas Christi Center "G" Building: three floors.                  */
/* ------------------------------------------------------------------ */

const G_OUTLINE_12: [number, number][] = [
  [0, 7.5],
  [26.9, 7.5],
  [26.9, 0],
  [38.1, 0],
  [38.1, 15.9],
  [40.6, 15.9],
  [40.6, 20.6],
  [38.1, 20.6],
  [38.1, 22.8],
  [0, 22.8],
  [0, 20.6],
  [-3.2, 20.6],
  [-3.2, 15.9],
  [0, 15.9],
];

const G_FLOOR_1: Floor3D = {
  name: '1st Floor',
  plates: [G_OUTLINE_12],
  rooms: [
    rm('G102', 'office', 28.2, 0.3, 2.5, 2.2),
    rm('G103', 'office', 30.7, 0.3, 2.2, 2.2),
    rm('G104', 'office', 32.9, 0.3, 2.2, 2.2),
    rm('G100', 'office', 35.1, 0.3, 2.8, 2.2),
    rm('G-STAIR-1', 'utility', 27.7, 3.7, 3.9, 3.8, 'Stairs', 90),
    rm('G-ASB', 'meeting', 31.6, 2.5, 6.3, 5, 'ASB'),
    rm('G111', 'office', 29.4, 7.9, 2.8, 1.8),
    rm('G-WELLNESS', 'open', 29.1, 9.7, 8.9, 3.4, 'Wellness'),
    rm('G132', 'office', 27.5, 13.1, 3.8, 2.2),
    rm('G133', 'office', 31.6, 13.1, 3.1, 2.2),
    rm('G137', 'office', 35.0, 13.1, 3.1, 2.2),
    rm('G117', 'classroom', 0, 8.1, 6.9, 5.6),
    rm('G120', 'office', 7.1, 7.8, 3.2, 2.2),
    rm('G121', 'office', 7.1, 10.0, 3.2, 2.5),
    rm('G117A', 'office', 7.1, 12.5, 1.7, 1.9),
    rm('G122', 'office', 8.8, 12.5, 1.7, 1.9),
    rm('G118', 'classroom', 12.5, 8.1, 6.9, 5.6),
    rm('G119', 'classroom', 19.4, 8.1, 5.9, 5.6),
    rm('G116', 'classroom', 0.5, 16.3, 5.8, 6.3),
    rm('G115', 'classroom', 6.3, 16.3, 6.3, 6.3),
    rm('G114', 'classroom', 12.6, 16.3, 6.3, 6.3),
    rm('G113', 'classroom', 18.9, 16.3, 6.3, 6.3),
    rm('G112', 'classroom', 25.2, 16.3, 5.6, 6.3),
    rm('G-RR-U1', 'restroom', 30.8, 16.3, 2.6, 2.2, 'Restroom'),
    rm('G-STAIR-W1', 'utility', -3.3, 16.5, 3.8, 3.7, 'Stairs', 90),
    rm('G-STAIR-E1', 'utility', 37.7, 17.7, 3.4, 2.5, 'Stairs', 90),
    rm('G-ELEV-1', 'utility', 34.9, 16.3, 1.8, 2.0, 'Elev'),
    rm('G-RR-W1', 'restroom', 30.8, 18.7, 2.4, 3.9, 'Restroom'),
    rm('G-RR-M1', 'restroom', 34.4, 18.7, 2.4, 3.9, 'Restroom'),
  ],
};

const G_OUTLINE_2: [number, number][] = [
  [0, 7.5],
  [24.5, 7.5],
  [24.5, 0],
  [38.1, 0],
  [38.1, 16.9],
  [40.6, 16.9],
  [40.6, 20.9],
  [38.1, 20.9],
  [38.1, 22.8],
  [0, 22.8],
  [0, 20.9],
  [-3.2, 20.9],
  [-3.2, 16.9],
  [0, 16.9],
];

const G_FLOOR_2: Floor3D = {
  name: '2nd Floor',
  plates: [G_OUTLINE_2],
  rooms: [
    rm('G202', 'office', 24.7, 0.3, 2.2, 2.2),
    rm('G203', 'office', 27.0, 0.3, 2.2, 2.2),
    rm('G204', 'office', 29.4, 0.3, 3.4, 2.2),
    rm('G205', 'office', 32.8, 0.3, 2.5, 2.2),
    rm('G206', 'office', 35.3, 0.3, 2.8, 2.2),
    rm('G-STAIR-2', 'utility', 26.9, 4.3, 4.2, 4.1, 'Stairs', 180),
    rm('G210', 'classroom', 31.3, 2.9, 6.8, 6.1),
    rm('G229', 'classroom', 26.9, 8.4, 4.1, 5.9),
    rm('G211', 'classroom', 31.3, 9.4, 6.8, 5.6),
    rm('G228', 'office', 26.9, 14.4, 2.2, 1.9),
    rm('G209', 'office', 29.1, 14.4, 2.1, 1.9),
    rm('G217', 'classroom', 0, 9.7, 6.3, 6.3),
    rm('G218', 'classroom', 6.3, 9.7, 6.3, 6.3),
    rm('G219', 'classroom', 12.6, 9.7, 6.3, 6.3),
    rm('G220', 'classroom', 18.9, 9.7, 5.0, 6.3),
    rm('G216', 'classroom', 0.3, 17.5, 6.0, 5.3),
    rm('G215', 'classroom', 6.3, 17.5, 6.3, 5.3),
    rm('G214', 'classroom', 12.6, 17.5, 6.3, 5.3),
    rm('G213', 'classroom', 18.9, 17.5, 6.3, 5.3),
    rm('G212', 'classroom', 25.2, 17.5, 5.6, 5.3),
    rm('G-RR-U2', 'restroom', 30.8, 17.5, 2.6, 2.2, 'Restroom'),
    rm('G-STAIR-W2', 'utility', -3.1, 17.2, 3.4, 3.5, 'Stairs'),
    rm('G-STAIR-E2', 'utility', 37.9, 17.6, 2.8, 3.1, 'Stairs'),
    rm('G-ELEV-2', 'utility', 34.9, 17.5, 1.8, 2.0, 'Elev'),
    rm('G-RR-W2', 'restroom', 30.8, 19.9, 2.4, 2.9, 'Restroom'),
    rm('G-RR-M2', 'restroom', 35.5, 19.8, 2.4, 2.9, 'Restroom'),
  ],
};

const G_OUTLINE_3: [number, number][] = [
  [0, 0],
  [38.1, 0],
  [38.1, 8.5],
  [40.9, 8.5],
  [40.9, 11.7],
  [38.1, 11.7],
  [38.1, 14.9],
  [0, 14.9],
  [0, 11.7],
  [-3.2, 11.7],
  [-3.2, 8.5],
  [0, 8.5],
];

const G_FLOOR_3: Floor3D = {
  name: '3rd Floor',
  plates: [G_OUTLINE_3],
  rooms: [
    rm('G306', 'classroom', 0, 0.3, 6.4, 6.3),
    rm('G307', 'classroom', 6.4, 0.3, 6.4, 6.3),
    rm('G308', 'classroom', 12.8, 0.3, 6.4, 6.3),
    rm('G309', 'classroom', 19.2, 0.3, 6.4, 6.3),
    rm('G310', 'classroom', 25.6, 0.3, 6.4, 6.3),
    rm('G311', 'classroom', 32.0, 0.3, 6.1, 6.3),
    rm('G305', 'classroom', 0, 8.8, 6.3, 5.9),
    rm('G304', 'classroom', 6.3, 8.8, 6.3, 5.9),
    rm('G303', 'classroom', 12.6, 8.8, 6.3, 5.9),
    rm('G302', 'classroom', 18.9, 8.8, 6.3, 5.9),
    rm('G301', 'classroom', 25.2, 8.8, 5.6, 5.9),
    rm('G-STAIR-W3', 'utility', -3.1, 8.6, 3, 3.1, 'Stairs'),
    rm('G-STAIR-E3', 'utility', 38.1, 9, 2.7, 2.7, 'Stairs', -90),
    rm('G-ELEV-3', 'utility', 36.1, 8.9, 1.8, 2.0, 'Elev'),
    rm('G-RR-W3', 'restroom', 30.9, 11.2, 2.4, 3.4, 'Restroom'),
    rm('G-RR-M3', 'restroom', 35.4, 11.2, 2.4, 3.4, 'Restroom'),
  ],
};

/* ------------------------------------------------------------------ */
/* Eagle Athletic Center "R" Building: three floors.                   */
/* ------------------------------------------------------------------ */

const R_FLOOR_1: Floor3D = {
  name: '1st Floor',
  plates: [
    [
      [0, 7.8],
      [9.2, 7.8],
      [9.2, 0.6],
      [24.4, 0.6],
      [24.4, 4.4],
      [38.9, 4.4],
      [38.9, 26.7],
      [21.0, 26.7],
      [21.0, 28.3],
      [4.4, 28.3],
      [4.4, 12.5],
      [0, 12.5],
    ],
  ],
  rooms: [
    rm('R110', 'open', 10.9, 7.8, 15.0, 16.1, 'Weight Room'),
    rm('R116', 'open', 25.9, 7.8, 12.4, 13.9, 'Weight Room'),
    rm('R-RR-W1', 'restroom', 4.7, 12.5, 6.1, 3.1, 'Restroom'),
    rm('R-RR-M1', 'restroom', 4.7, 15.6, 6.1, 2.8, 'Restroom'),
    rm('R109', 'open', 4.7, 20.0, 6.1, 7.8, 'Training Room'),
    rm('R-STAIR-1', 'utility', 18.3, 25.2, 2.8, 2.8, 'Stairs'),
    rm('R-ELEV-1', 'utility', 21.4, 24.1, 1.9, 2.3, 'Elev'),
  ],
};

const R_FLOOR_2: Floor3D = {
  name: '2nd Floor',
  plates: [
    [
      [0, 5.6],
      [9.4, 5.6],
      [9.4, 0.6],
      [19.4, 0.6],
      [19.4, 2.8],
      [41.1, 2.8],
      [41.1, 27.8],
      [5.6, 27.8],
      [0, 20.0],
    ],
  ],
  rooms: [
    rm('R203', 'office', 6.9, 11.4, 3.1, 4.2),
    rm('R205', 'office', 6.9, 16.1, 3.1, 2.5),
    rm('R202', 'meeting', 13.1, 11.1, 3.6, 3.6),
    rm('R204', 'meeting', 13.1, 14.7, 3.6, 3.1),
    rm('R206', 'office', 13.1, 18.1, 3.6, 2.2),
    rm('R207', 'open', 7.8, 20.6, 8.9, 4.1, 'Football Offices'),
    rm('R208', 'office', 6.9, 24.7, 3.9, 2.9),
    rm('R209', 'meeting', 10.8, 24.7, 9.2, 2.9),
    rm('R222', 'classroom', 27.2, 5.3, 12.8, 17.2, 'Dance Room'),
    rm('R215', 'classroom', 28.3, 22.5, 11.7, 5.0),
    rm('R-STAIR-N2', 'utility', 29.2, 3.0, 2.9, 2.0, 'Stairs'),
    rm('R-STAIR-S2', 'utility', 21.4, 24.8, 2.8, 2.6, 'Stairs'),
    rm('R-ELEV-2', 'utility', 24.9, 22.6, 1.9, 2.2, 'Elev'),
    rm('R-RR-M2', 'restroom', 24.2, 13.3, 2.8, 3.3, 'Restroom'),
    rm('R-RR-U2', 'restroom', 24.2, 19.7, 2.5, 2.5, 'Restroom'),
  ],
};

const R_FLOOR_3: Floor3D = {
  name: '3rd Floor',
  plates: [
    [
      [0, 3.9],
      [12.5, 3.9],
      [12.5, 0.6],
      [42.8, 0.6],
      [42.8, 35.6],
      [0, 35.6],
    ],
  ],
  rooms: [
    rm('R301', 'office', 0.3, 4.2, 3.3, 4.2),
    rm('R326', 'office', 4.4, 3.9, 5.3, 2.8),
    rm('R302', 'office', 0.3, 8.9, 3.3, 3.3),
    rm('R305B', 'meeting', 0.3, 12.5, 4.2, 12.5),
    rm('R304', 'open', 4.9, 8.6, 6.7, 18.3, 'Athletic Offices'),
    rm('R305', 'office', 0.3, 25.3, 4.2, 3.3),
    rm('R306', 'office', 0.3, 28.8, 4.2, 4.4),
    rm('R307', 'office', 4.7, 29.7, 3.3, 3.3),
    rm('R308', 'office', 8.0, 29.7, 3.3, 3.3),
    rm('R300', 'office', 12.5, 29.4, 4.2, 6.0),
    rm('R-RR-M3', 'restroom', 17.2, 9.7, 8.3, 4.4, 'Restroom'),
    rm('R-RR-W3', 'restroom', 17.2, 14.4, 8.3, 4.2, 'Restroom'),
    rm('R319', 'classroom', 28.6, 4.7, 14.0, 5.0),
    rm('R318', 'classroom', 28.6, 9.7, 14.0, 7.8),
    rm('R314', 'classroom', 28.6, 17.5, 14.0, 7.8),
    rm('R313', 'classroom', 28.6, 25.3, 14.0, 8.9),
    rm('R-STAIR-N3', 'utility', 28.9, 0.9, 3.8, 3.8, 'Stairs'),
    rm('R-ELEV-3', 'utility', 22.9, 28.4, 2.2, 2.4, 'Elev'),
    rm('R-STAIR-3', 'utility', 22, 31.5, 3.6, 3.5, 'Stairs', 180),
  ],
};

/* ------------------------------------------------------------------ */
/* Academic Services Center "S" Building: two floors.                  */
/* ------------------------------------------------------------------ */

const S_FLOOR_1: Floor3D = {
  name: '1st Floor',
  plates: [
    [
      [0, 0],
      [39.7, 0],
      [39.7, 23.8],
      [0, 23.8],
    ],
  ],
  rooms: [
    rm('S101', 'office', 2.2, 0.3, 4.1, 2.8),
    rm('S-FOYER', 'open', 6.6, 0.3, 7.5, 3.4, 'Counseling Foyer'),
    rm('S118', 'office', 20.0, 0.3, 2.5, 2.8),
    rm('S119', 'office', 22.5, 0.3, 2.5, 2.8),
    rm('S120', 'office', 25.0, 0.3, 1.5, 2.8),
    rm('S124', 'office', 35.0, 0.3, 4.1, 2.5),
    rm('S102', 'office', 2.2, 3.4, 3.4, 2.8),
    rm('S104', 'office', 3.3, 6.6, 2.3, 2.8),
    rm('S106', 'office', 8.8, 4.4, 3.4, 2.5),
    rm('S107', 'office', 8.8, 7.2, 3.4, 2.8),
    rm('S-CONF', 'open', 12.8, 4.4, 9.4, 5.6, 'Conference Area'),
    rm('S117', 'office', 22.8, 4.4, 3.1, 2.5),
    rm('S116', 'office', 22.8, 7.2, 3.1, 2.5),
    rm('S123', 'classroom', 26.6, 0.3, 6.3, 10.3, 'ETV Studio'),
    rm('S125', 'classroom', 35.0, 3.1, 4.1, 6.9),
    rm('S115', 'office', 22.8, 10.0, 3.4, 2.8),
    rm('S110', 'meeting', 7.2, 10.3, 2.8, 2.8),
    rm('S111', 'office', 10.0, 10.3, 2.8, 2.8),
    rm('S112', 'office', 12.8, 10.3, 2.8, 2.8),
    rm('S113', 'office', 15.6, 10.3, 2.8, 2.8),
    rm('S114', 'office', 18.4, 10.3, 3.1, 2.8),
    rm('S-RR-1', 'restroom', 1.3, 10.3, 2.8, 3.1, 'Restroom'),
    rm('S-ELEV-1', 'utility', 0.6, 6.9, 1.8, 2.0, 'Elev'),
    rm('S-STAIR-NW1', 'utility', 0.2, 0.4, 1.7, 6, 'Stairs', 180),
    rm('S-STAIR-E1', 'utility', 38.2, 16.4, 1.3, 6.6, 'Stairs'),
    rm('S141', 'meeting', 0.3, 14.4, 4.1, 3.1, 'ASP'),
    rm('S140', 'classroom', 0, 17.8, 5.0, 5.6, 'ASP Testing Center'),
    rm('S139', 'open', 5.0, 15.9, 4.4, 7.5, 'ASP'),
    rm('S132', 'office', 9.4, 15.0, 2.8, 2.6, 'ASP'),
    rm('S133', 'office', 9.4, 17.8, 2.8, 2.6, 'ASP'),
    rm('S134', 'office', 9.4, 20.6, 2.8, 2.6, 'ASP'),
    rm('S131A', 'classroom', 12.2, 14.4, 6.9, 4.7, 'ASP'),
    rm('S130A', 'classroom', 19.1, 14.4, 6.9, 4.7, 'ASP'),
    rm('S131B', 'classroom', 12.2, 19.1, 6.9, 4.6, 'ASP'),
    rm('S130B', 'classroom', 19.1, 19.1, 6.9, 4.6, 'ASP'),
    rm('S129', 'classroom', 26.3, 14.4, 6.6, 9.3, 'ETV eSports'),
    rm('S128A', 'utility', 33.4, 13.8, 3.8, 2.2),
    rm('S128', 'classroom', 33.4, 16.2, 4.6, 7.5, 'Robotics'),
  ],
};

const S_FLOOR_2: Floor3D = {
  name: '2nd Floor',
  plates: [
    [
      [0, 0.6],
      [37.7, 0.6],
      [37.7, 11.9],
      [39.4, 11.9],
      [39.4, 20.4],
      [37.7, 20.4],
      [37.7, 20.6],
      [0, 20.6],
    ],
  ],
  rooms: [
    rm('S201', 'classroom', 4.4, 0.9, 6.6, 8.1),
    rm('S202', 'classroom', 11.0, 0.9, 6.6, 8.1),
    rm('S203', 'classroom', 17.6, 0.9, 6.6, 8.1),
    rm('S204', 'classroom', 24.2, 0.9, 6.6, 8.1),
    rm('S205', 'classroom', 30.8, 0.9, 6.6, 8.1),
    rm('S-STAIR-NW2', 'utility', 2.1, 0.8, 2.3, 6.6, 'Stairs', 180),
    rm('S-ELEV-2', 'utility', 0.7, 7.5, 1.6, 1.8, 'Elev'),
    rm('S-STAIR-E2', 'utility', 37.7, 12.3, 1.5, 7.8, 'Stairs'),
    rm('S-RR-2', 'restroom', 0.2, 11, 2.2, 2.8, 'Restroom'),
    rm('S-RR-W2', 'restroom', 0.3, 14.4, 1.9, 4.4, 'Restroom'),
    rm('S-RR-M2', 'restroom', 2.4, 14.4, 1.9, 4.4, 'Restroom'),
    rm('S212', 'classroom', 4.4, 11.9, 6.6, 8.4),
    rm('S211', 'classroom', 11.0, 11.9, 6.6, 8.4),
    rm('S210', 'classroom', 17.6, 11.9, 6.6, 8.4),
    rm('S209', 'classroom', 24.2, 11.9, 6.6, 8.4),
    rm('S208', 'classroom', 30.8, 11.9, 6.6, 8.4),
  ],
};

export const INTERIORS: Record<string, Floor3D[]> = {
  A: [A_FLOOR],
  B: [B_FLOOR_1, B_FLOOR_2],
  C: [C_FLOOR],
  D: [D_FLOOR],
  G: [G_FLOOR_1, G_FLOOR_2, G_FLOOR_3],
  R: [R_FLOOR_1, R_FLOOR_2, R_FLOOR_3],
  S: [S_FLOOR_1, S_FLOOR_2],
};
