/**
 * Local overrides for 3D campus room placement, used by the map editor
 * (open /more/map?edit=1). Edits are absolute room values keyed by room id,
 * persisted in localStorage so they apply on every visit on this device.
 * "Copy JSON" in the editor exports them for baking back into
 * config/campus3d/interiors.ts.
 */
import type { Room3D } from '@/config/campus3d/types';

export interface RoomEdit {
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
}

const KEY = 'smchs-campus3d-edits';

export function loadEdits(): Record<string, RoomEdit> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveEdits(edits: Record<string, RoomEdit>): void {
  try {
    if (Object.keys(edits).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(edits));
  } catch {
    // Storage full/blocked: edits still apply for this session.
  }
}

/** The room's current values, edit applied when present. */
export function editedRoom(room: Room3D, edit?: RoomEdit): Room3D {
  if (!edit) return room;
  return { ...room, rect: [edit.x, edit.y, edit.w, edit.d], rot: edit.rot || undefined };
}

/** Snapshot a room's current values as a starting edit. */
export function editFromRoom(room: Room3D): RoomEdit {
  const [x, y, w, d] = room.rect;
  return { x, y, w, d, rot: room.rot ?? 0 };
}
