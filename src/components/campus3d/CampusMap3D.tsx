'use client';

/**
 * Native 3D building viewer. Students pick a building (chips on the map
 * page), see one floor at a time as an architectural model: floor plate,
 * rooms with real walls and outlines, room numbers painted on the floor,
 * stepped stairs. Geometry comes from the school's Classroom Locator floor
 * plans. Pure three.js via react-three-fiber, no remote assets, renders on
 * demand (battery friendly), touch-first.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { BUILDINGS_3D } from '@/config/campus3d/campus';
import { effectiveBuildingName, useAppStore } from '@/lib/store';
import type { Building3D, Floor3D, Room3D, RoomType } from '@/config/campus3d/types';
import {
  editedRoom,
  editFromRoom,
  loadEdits,
  saveEdits,
  type RoomEdit,
} from '@/lib/campusEdits';

/* ---------------------------------------------------------------- */
/* Palette                                                          */
/* ---------------------------------------------------------------- */

interface Palette {
  bg: string;
  fog: string;
  discInner: string;
  discOuter: string;
  plate: string;
  plateEdge: string;
  outline: string;
  stair: string;
  gold: string;
  goldWall: string;
  text: string;
  textHalo: string;
  room: Record<RoomType, string>;
}

const LIGHT: Palette = {
  bg: '#dfe7f2',
  fog: '#dfe7f2',
  discInner: '#f2f5f9',
  discOuter: '#ccd6e4',
  plate: '#f7f9fc',
  plateEdge: '#8fa3c0',
  outline: '#2b3648',
  stair: '#c6cdd8',
  gold: '#B4A365',
  goldWall: '#cfc39a',
  text: '#1d2530',
  textHalo: 'rgba(255,255,255,0.85)',
  room: {
    classroom: '#8ecbea',
    office: '#f2ab66',
    restroom: '#efd75e',
    meeting: '#d9aede',
    open: '#d6dee8',
    utility: '#bcc5d0',
  },
};

const DARK: Palette = {
  bg: '#0c1626',
  fog: '#0c1626',
  discInner: '#1d2d47',
  discOuter: '#101c30',
  plate: '#243854',
  plateEdge: '#7291bd',
  outline: '#dce6f4',
  stair: '#46587a',
  gold: '#c9b878',
  goldWall: '#a5975e',
  text: '#f2f6fc',
  textHalo: 'rgba(8,15,28,0.8)',
  room: {
    classroom: '#3d7ea6',
    office: '#a86f36',
    restroom: '#9d8c2c',
    meeting: '#8f6a94',
    open: '#3a4a60',
    utility: '#333f4f',
  },
};

/* ---------------------------------------------------------------- */
/* Helpers                                                          */
/* ---------------------------------------------------------------- */

const DEG = Math.PI / 180;
const WALL_H = 1.7;
const WALL_T = 0.28;
/** Rooms render inset from their traced rect so neighbors never touch. */
const INSET = 0.14;
const SLAB_H = 0.14;
const ROOF_H = 0.12;

function plateShape(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, -y) : s.lineTo(x, -y)));
  s.closePath();
  return s;
}

function planBounds(floors: Floor3D[]): { cx: number; cy: number; w: number; d: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of floors) {
    for (const plate of f.plates) {
      for (const [x, y] of plate) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, d: maxY - minY };
}

function extrudePlates(plates: [number, number][][], height: number): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(
    plates.map(plateShape),
    { depth: height, bevelEnabled: false },
  );
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function lighten(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), amount);
  return `#${c.getHexString()}`;
}

/* ---------------------------------------------------------------- */
/* Flat text painted on the room floor                              */
/* ---------------------------------------------------------------- */

function makeTextTexture(
  lines: string[],
  color: string,
  halo: string,
): { tex: THREE.CanvasTexture; aspect: number } {
  const big = 110;
  const small = 60;
  const pad = 20;
  const cv = document.createElement('canvas');
  let ctx = cv.getContext('2d')!;
  const font = (i: number) =>
    `${i === 0 ? 800 : 700} ${i === 0 ? big : small}px system-ui, -apple-system, sans-serif`;
  let w = 2;
  lines.forEach((ln, i) => {
    ctx.font = font(i);
    w = Math.max(w, ctx.measureText(ln).width);
  });
  const lineHs = lines.map((_, i) => (i === 0 ? big : small) * 1.18);
  const h = lineHs.reduce((a, b) => a + b, 0) + pad * 2;
  cv.width = Math.ceil(w) + pad * 2;
  cv.height = Math.ceil(h);
  ctx = cv.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let y = pad;
  lines.forEach((ln, i) => {
    ctx.font = font(i);
    // Halo stroke keeps the number readable on any floor color.
    ctx.strokeStyle = halo;
    ctx.lineWidth = i === 0 ? 12 : 8;
    ctx.strokeText(ln, cv.width / 2, y + lineHs[i] / 2);
    ctx.fillStyle = color;
    ctx.fillText(ln, cv.width / 2, y + lineHs[i] / 2);
    y += lineHs[i];
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  return { tex, aspect: cv.width / cv.height };
}

/** Room text lying flat on the floor, sized to fit the room. */
function FloorText({
  lines,
  y,
  w,
  d,
  color,
  halo,
}: {
  lines: string[];
  y: number;
  w: number;
  d: number;
  color: string;
  halo: string;
}) {
  const { tex, aspect } = useMemo(() => makeTextTexture(lines, color, halo), [lines, color, halo]);
  useEffect(() => () => tex.dispose(), [tex]);
  // Fill most of the room, whichever axis binds.
  let th = Math.min(d * 0.72, 2.4 * lines.length);
  let tw = th * aspect;
  if (tw > w * 0.86) {
    tw = w * 0.86;
    th = tw / aspect;
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={3}>
      <planeGeometry args={[tw, th]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/** What to paint on the floor of a room. */
function roomTextLines(room: Room3D): string[] {
  if (room.label === 'Stairs') return [];
  const isCode = !room.id.includes('-');
  if (isCode) {
    return room.label ? [room.id, room.label] : [room.id];
  }
  if (room.label === 'Restroom') return ['WC'];
  return room.label ? [room.label] : [];
}

/* ---------------------------------------------------------------- */
/* Camera rig                                                       */
/* ---------------------------------------------------------------- */

interface CamGoal {
  key: string;
  pos: [number, number, number];
  target: [number, number, number];
}

function CameraRig({ goal, enabled = true }: { goal: CamGoal; enabled?: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { invalidate } = useThree();
  const anim = useRef({ active: false, key: '' });

  useEffect(() => {
    if (anim.current.key !== goal.key) {
      anim.current = { active: true, key: goal.key };
      invalidate();
    }
  }, [goal, invalidate]);

  useFrame(({ camera }) => {
    const c = controls.current;
    if (!c || !anim.current.active) return;
    const p = new THREE.Vector3(...goal.pos);
    const t = new THREE.Vector3(...goal.target);
    camera.position.lerp(p, 0.09);
    c.target.lerp(t, 0.11);
    c.update();
    if (camera.position.distanceTo(p) < 0.3 && c.target.distanceTo(t) < 0.2) {
      anim.current.active = false;
    } else {
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={enabled}
      enableDamping
      dampingFactor={0.12}
      enablePan
      screenSpacePanning
      minDistance={10}
      maxDistance={220}
      maxPolarAngle={Math.PI * 0.46}
      onChange={() => invalidate()}
      onStart={() => {
        anim.current.active = false;
      }}
    />
  );
}

/* ---------------------------------------------------------------- */
/* Floor pieces                                                     */
/* ---------------------------------------------------------------- */

function GroundDisc({ radius, pal }: { radius: number; pal: Palette }) {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, pal.discInner);
    g.addColorStop(1, pal.discOuter);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  }, [pal]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]}>
      <circleGeometry args={[radius, 56]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  );
}

function FloorPlate({ floor, pal }: { floor: Floor3D; pal: Palette }) {
  const geo = useMemo(() => extrudePlates(floor.plates, 0.5), [floor]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 24), [geo]);
  useEffect(() => () => {
    geo.dispose();
    edges.dispose();
  }, [geo, edges]);
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial color={pal.plate} roughness={0.85} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={pal.plateEdge} transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}

/** Hollow wall ring (rect with a rect hole) for one room. */
function wallGeometry(w: number, d: number, h: number): THREE.ExtrudeGeometry {
  const outer = new THREE.Shape();
  outer.moveTo(-w / 2, -d / 2);
  outer.lineTo(w / 2, -d / 2);
  outer.lineTo(w / 2, d / 2);
  outer.lineTo(-w / 2, d / 2);
  outer.closePath();
  const iw = w / 2 - WALL_T;
  const id = d / 2 - WALL_T;
  const hole = new THREE.Path();
  hole.moveTo(-iw, -id);
  hole.lineTo(iw, -id);
  hole.lineTo(iw, id);
  hole.lineTo(-iw, id);
  hole.closePath();
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function StairMesh({ w, d, pal }: { w: number; d: number; pal: Palette }) {
  // Steps climb along the longer axis, spanning the shorter one.
  const along = Math.max(w, d);
  const across = Math.min(w, d);
  const steps = 7;
  const rise = 1.9;
  const tread = along / steps;
  const boxes = [];
  for (let i = 0; i < steps; i++) {
    const h = ((i + 1) / steps) * rise;
    boxes.push(
      <mesh
        key={i}
        position={[-along / 2 + tread * (i + 0.5), h / 2, 0]}
      >
        <boxGeometry args={[tread * 0.94, h, across * 0.86]} />
        <meshStandardMaterial color={pal.stair} roughness={0.8} />
      </mesh>,
    );
  }
  return <group rotation={[0, w >= d ? 0 : Math.PI / 2, 0]}>{boxes}</group>;
}

function RoomMesh({
  room,
  pal,
  dark,
  selected,
  onPick,
  onDragStart,
}: {
  room: Room3D;
  pal: Palette;
  dark: boolean;
  selected: boolean;
  onPick: (r: Room3D) => void;
  /** Edit mode: pointer-down on the (selected) room begins a move drag. */
  onDragStart?: (room: Room3D, point: THREE.Vector3) => void;
}) {
  const dragProps = onDragStart
    ? {
        onPointerDown: (e: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onDragStart(room, e.point);
        },
      }
    : {};
  const [x, y, w0, d0] = room.rect;
  const w = Math.max(w0 - INSET * 2, 0.6);
  const d = Math.max(d0 - INSET * 2, 0.6);
  const isStairs = room.label === 'Stairs';
  const hasWalls = !isStairs && room.type !== 'open' && w > WALL_T * 3 && d > WALL_T * 3;
  const wallH = room.type === 'utility' ? 1.1 : WALL_H;

  const walls = useMemo(
    () => (hasWalls ? wallGeometry(w, d, wallH) : null),
    [hasWalls, w, d, wallH],
  );
  const wallEdges = useMemo(() => (walls ? new THREE.EdgesGeometry(walls, 30) : null), [walls]);
  const roofBox = useMemo(
    () => (hasWalls ? new THREE.BoxGeometry(w, ROOF_H, d) : null),
    [hasWalls, w, d],
  );
  useEffect(
    () => () => {
      walls?.dispose();
      wallEdges?.dispose();
      roofBox?.dispose();
    },
    [walls, wallEdges, roofBox],
  );

  const floorColor = selected ? pal.gold : pal.room[room.type];
  const wallColor = selected ? pal.goldWall : lighten(pal.room[room.type], dark ? 0.12 : 0.42);
  const lines = roomTextLines(room);

  return (
    <group
      position={[x + w0 / 2, 0.5, y + d0 / 2]}
      rotation={[0, -(room.rot ?? 0) * DEG, 0]}
    >
      {/* Floor slab (also the tap target). */}
      <mesh
        position={[0, SLAB_H / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onPick(room);
        }}
        {...dragProps}
      >
        <boxGeometry args={[w, SLAB_H, d]} />
        <meshStandardMaterial
          color={floorColor}
          roughness={0.7}
          emissive={selected ? pal.gold : '#000000'}
          emissiveIntensity={selected ? 0.3 : 0}
        />
      </mesh>

      {isStairs ? (
        <group position={[0, SLAB_H, 0]}>
          <StairMesh w={w} d={d} pal={pal} />
        </group>
      ) : walls && wallEdges && roofBox ? (
        <group position={[0, SLAB_H, 0]}>
          <mesh
            geometry={walls}
            onClick={(e) => {
              e.stopPropagation();
              onPick(room);
            }}
          >
            <meshStandardMaterial color={wallColor} roughness={0.75} />
          </mesh>
          <lineSegments geometry={wallEdges}>
            <lineBasicMaterial color={pal.outline} transparent opacity={dark ? 0.7 : 0.85} />
          </lineSegments>
          {/* Roof: the color-coded top face, also the main tap target. */}
          <mesh
            position={[0, wallH + ROOF_H / 2, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onPick(room);
            }}
            {...dragProps}
          >
            <boxGeometry args={[w, ROOF_H, d]} />
            <meshStandardMaterial
              color={floorColor}
              roughness={0.7}
              emissive={selected ? pal.gold : '#000000'}
              emissiveIntensity={selected ? 0.3 : 0}
            />
          </mesh>
          <lineSegments position={[0, wallH + ROOF_H / 2, 0]}>
            <edgesGeometry args={[roofBox]} />
            <lineBasicMaterial color={pal.outline} transparent opacity={dark ? 0.7 : 0.85} />
          </lineSegments>
        </group>
      ) : null}

      {lines.length > 0 && (
        <FloorText
          lines={lines}
          y={walls ? SLAB_H + wallH + ROOF_H + 0.03 : SLAB_H + 0.04}
          w={w}
          d={d}
          color={pal.text}
          halo={selected ? pal.gold : pal.textHalo}
        />
      )}
    </group>
  );
}

/* ---------------------------------------------------------------- */
/* Building scene + component shell                                 */
/* ---------------------------------------------------------------- */

const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  classroom: 'Classroom',
  office: 'Office',
  restroom: 'Restroom',
  meeting: 'Meeting room',
  open: 'Open space',
  utility: 'Utility',
};

function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains('dark'));
    update();
    const mo = new MutationObserver(update);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

function buildingGoal(b: Building3D): CamGoal {
  const bounds = planBounds(b.floors);
  const dist = Math.max(bounds.w, bounds.d) * 1.3 + 16;
  return {
    key: b.code,
    pos: [dist * 0.42, dist * 0.95, dist * 0.62],
    target: [0, 1, 0],
  };
}

/** Close-up on one room (used when a search result is picked). */
function roomGoal(b: Building3D, hit: RoomHit): CamGoal {
  const bounds = planBounds(b.floors);
  const [x, y, w, d] = hit.room.rect;
  // Room center in the building's local frame, then rotated into world.
  const lx = x + w / 2 - bounds.cx;
  const lz = y + d / 2 - bounds.cy;
  const th = -(b.rotation ?? 0) * DEG;
  const wx = lx * Math.cos(th) + lz * Math.sin(th);
  const wz = -lx * Math.sin(th) + lz * Math.cos(th);
  const dist = Math.max(w, d) * 2.4 + 11;
  return {
    key: `room:${b.code}:${hit.room.id}`,
    pos: [wx + dist * 0.4, dist * 0.85, wz + dist * 0.55],
    target: [wx, 1, wz],
  };
}

export interface RoomHit {
  building: string;
  floor: number;
  room: Room3D;
}

/** Flat index of every room for search. */
export function searchRooms(q: string): RoomHit[] {
  const query = q.trim().toUpperCase();
  if (query.length < 2) return [];
  const hits: RoomHit[] = [];
  for (const b of BUILDINGS_3D) {
    b.floors.forEach((f, fi) => {
      for (const r of f.rooms) {
        const hay = `${r.id} ${r.label ?? ''}`.toUpperCase();
        if (hay.includes(query)) hits.push({ building: b.code, floor: fi, room: r });
      }
    });
  }
  return hits.slice(0, 12);
}

const snap = (v: number) => Math.round(v * 10) / 10;

export default function CampusMap3D({
  building: buildingCode,
  focusRoom,
  editable = false,
}: {
  /** Code of the building to show (A, B, C, D, G, S, R). */
  building: string;
  /** When set (from search), jump to this room. */
  focusRoom?: RoomHit | null;
  /** Layout editor: drag rooms, resize/rotate via the pad, export JSON. */
  editable?: boolean;
}) {
  const dark = useIsDark();
  const pal = dark ? DARK : LIGHT;
  const [floor, setFloor] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<RoomHit | null>(null);
  const [edits, setEdits] = useState<Record<string, RoomEdit>>({});
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

  const configBuilding = BUILDINGS_3D.find((b) => b.code === buildingCode) ?? BUILDINGS_3D[0];
  // The label set on this building's outline in the admin editor renames it here.
  const serverData = useAppStore((s) => s.serverData);
  const admin = useAppStore((s) => s.admin);
  const customName = effectiveBuildingName(serverData, admin, buildingCode);
  const building = customName ? { ...configBuilding, name: customName } : configBuilding;

  // Saved edits apply for everyone on this device, not just in edit mode.
  useEffect(() => {
    setEdits(loadEdits());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setFloor(0);
    setSelectedId(null);
    setFocus(null);
  }, [buildingCode]);

  useEffect(() => {
    if (!focusRoom) return;
    setFloor(focusRoom.floor);
    setSelectedId(focusRoom.room.id);
    setFocus(focusRoom);
  }, [focusRoom]);

  const goal = useMemo(
    () =>
      focus && focus.building === building.code
        ? roomGoal(building, focus)
        : buildingGoal(building),
    [building, focus],
  );
  const bounds = useMemo(() => planBounds(building.floors), [building]);
  const activeFloor = building.floors[Math.min(floor, building.floors.length - 1)];
  const rooms = useMemo(
    () => activeFloor.rooms.map((r) => editedRoom(r, edits[r.id])),
    [activeFloor, edits],
  );
  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  const updateEdits = (next: Record<string, RoomEdit>) => {
    setEdits(next);
    saveEdits(next);
  };

  /** Merge a change into the selected room's edit (absolute values). */
  const patchSelected = (patch: Partial<RoomEdit>) => {
    if (!selected) return;
    const cur = edits[selected.id] ?? editFromRoom(selected);
    const next: RoomEdit = { ...cur, ...patch };
    next.w = Math.max(0.6, snap(next.w));
    next.d = Math.max(0.6, snap(next.d));
    next.x = snap(next.x);
    next.y = snap(next.y);
    next.rot = Math.round(next.rot);
    updateEdits({ ...edits, [selected.id]: next });
  };

  /** World point (drag plane) -> plan coordinates of this building. */
  const worldToPlan = (p: THREE.Vector3) => {
    const th = (building.rotation ?? 0) * DEG;
    const lx = p.x * Math.cos(th) + p.z * Math.sin(th);
    const lz = -p.x * Math.sin(th) + p.z * Math.cos(th);
    return { x: lx + bounds.cx, y: lz + bounds.cy };
  };

  const startDrag = (room: Room3D, point: THREE.Vector3) => {
    const plan = worldToPlan(point);
    dragRef.current = { id: room.id, offX: room.rect[0] - plan.x, offY: room.rect[1] - plan.y };
    setDragging(true);
  };

  const moveDrag = (point: THREE.Vector3) => {
    const drag = dragRef.current;
    if (!drag || !selected || selected.id !== drag.id) return;
    const plan = worldToPlan(point);
    patchSelected({ x: snap(plan.x + drag.offX), y: snap(plan.y + drag.offY) });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const copyEdits = async () => {
    const n = Object.keys(edits).length;
    try {
      await navigator.clipboard.writeText(JSON.stringify(edits, null, 1));
      setToast(`Copied ${n} room edit${n === 1 ? '' : 's'} as JSON`);
    } catch {
      setToast('Copy failed: clipboard blocked');
    }
  };

  const fmt = (r: Room3D) =>
    `x ${r.rect[0]} · y ${r.rect[1]} · w ${r.rect[2]} · d ${r.rect[3]} · rot ${r.rot ?? 0}°`;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: pal.bg }}
      onPointerUp={endDrag}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: goal.pos, fov: 44, near: 0.5, far: 600 }}
        onPointerMissed={() => {
          if (!dragging) setSelectedId(null);
        }}
      >
        <color attach="background" args={[pal.bg]} />
        <fog attach="fog" args={[pal.fog, 150, 420]} />
        <hemisphereLight
          args={[dark ? '#6d87b5' : '#ffffff', dark ? '#20304a' : '#c9d4e4', dark ? 1.1 : 0.95]}
        />
        <directionalLight position={[60, 90, 40]} intensity={dark ? 0.9 : 1.05} />
        <directionalLight position={[-50, 60, -70]} intensity={0.3} />
        <CameraRig goal={goal} enabled={!dragging} />

        <GroundDisc radius={Math.max(bounds.w, bounds.d) * 1.4} pal={pal} />
        <group rotation={[0, -(building.rotation ?? 0) * DEG, 0]}>
          <group position={[-bounds.cx, 0, -bounds.cy]}>
            <FloorPlate key={activeFloor.name} floor={activeFloor} pal={pal} />
            {rooms.map((room) => (
              <RoomMesh
                key={room.id}
                room={room}
                pal={pal}
                dark={dark}
                selected={selectedId === room.id}
                onPick={(r) => setSelectedId(r.id)}
                onDragStart={
                  editable && selectedId === room.id ? startDrag : undefined
                }
              />
            ))}
          </group>
        </group>

        {/* Invisible plane that receives pointer moves while dragging a room. */}
        {dragging && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.7, 0]}
            onPointerMove={(e) => moveDrag(e.point)}
            onPointerUp={endDrag}
          >
            <planeGeometry args={[500, 500]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </Canvas>

      {/* HTML overlay. pl-28 clears the map page's floating "← Campus" button. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pl-28">
        <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          {editable
            ? 'EDIT MODE · tap a room, then drag it'
            : 'drag to spin · pinch to zoom · two fingers to move'}
        </span>
        <div className="max-w-[62%] rounded-card bg-black/60 px-3 py-1.5 text-right backdrop-blur">
          <p className="text-sm font-bold leading-tight text-white">{building.name}</p>
          {building.tagline && (
            <p className="text-[11px] leading-tight text-white/75">{building.tagline}</p>
          )}
        </div>
      </div>

      {toast && (
        <div className="absolute inset-x-0 top-12 flex justify-center">
          <span className="rounded-full bg-royal px-3 py-1 text-xs font-semibold text-white shadow">
            {toast}
          </span>
        </div>
      )}

      {building.floors.length > 1 && (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col-reverse gap-1.5">
          {building.floors.map((f, i) => (
            <button
              key={f.name}
              onClick={() => {
                setSelectedId(null);
                setFocus(null);
                setFloor(i);
              }}
              className={`tap h-10 w-10 rounded-full text-sm font-bold shadow transition-colors ${
                i === floor
                  ? 'bg-royal text-white'
                  : 'bg-white/85 text-royal dark:bg-white/15 dark:text-white'
              }`}
              aria-label={f.name}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {selected && !editable && (
        <div className="absolute inset-x-3 bottom-3 rounded-card border border-[var(--divider)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur">
          <p className="text-base font-bold text-[var(--text)]">
            {selected.id.includes('-')
              ? selected.label ?? selected.id
              : selected.label
                ? `${selected.id} · ${selected.label}`
                : selected.id}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {ROOM_TYPE_LABEL[selected.type]} · {activeFloor.name} · {building.name}
          </p>
        </div>
      )}

      {editable && (
        <div className="absolute inset-x-3 bottom-3 rounded-card border border-[var(--divider)] bg-[var(--surface)]/95 p-2.5 shadow-lg backdrop-blur">
          {selected ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-[var(--text)]">{selected.id}</p>
                <p className="font-mono text-[11px] text-[var(--muted)]">{fmt(selected)}</p>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                <EBtn label="←" hint="x −" onClick={() => patchSelected({ x: selected.rect[0] - 0.2 })} />
                <EBtn label="→" hint="x +" onClick={() => patchSelected({ x: selected.rect[0] + 0.2 })} />
                <EBtn label="↑" hint="y −" onClick={() => patchSelected({ y: selected.rect[1] - 0.2 })} />
                <EBtn label="↓" hint="y +" onClick={() => patchSelected({ y: selected.rect[1] + 0.2 })} />
                <EBtn label="W−" hint="narrower" onClick={() => patchSelected({ w: selected.rect[2] - 0.2 })} />
                <EBtn label="W+" hint="wider" onClick={() => patchSelected({ w: selected.rect[2] + 0.2 })} />
                <EBtn label="D−" hint="shallower" onClick={() => patchSelected({ d: selected.rect[3] - 0.2 })} />
                <EBtn label="D+" hint="deeper" onClick={() => patchSelected({ d: selected.rect[3] + 0.2 })} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <EBtn label="⟲ 5°" hint="rotate ccw" onClick={() => patchSelected({ rot: (selected.rot ?? 0) - 5 })} />
                <EBtn label="⟳ 5°" hint="rotate cw" onClick={() => patchSelected({ rot: (selected.rot ?? 0) + 5 })} />
                <EBtn
                  label="Reset room"
                  onClick={() => {
                    const next = { ...edits };
                    delete next[selected.id];
                    updateEdits(next);
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Tap a room to edit it. {Object.keys(edits).length} edited room
              {Object.keys(edits).length === 1 ? '' : 's'} saved on this device.
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--divider)] pt-1.5">
            <EBtn label={`Copy JSON (${Object.keys(edits).length})`} onClick={copyEdits} />
            <EBtn
              label="Reset all"
              onClick={() => {
                updateEdits({});
                setToast('All edits cleared');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact editor button. */
function EBtn({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className="tap rounded-card border border-[var(--divider)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--text)] hover:border-royal"
    >
      {label}
    </button>
  );
}
