'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCampus, type CampusInfo } from '@/lib/providers/live';
import { telHref } from '@/lib/links';
import {
  effectiveBuildingName,
  effectiveOutlines,
  effectivePois,
  useAppStore,
} from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { buildingLabel } from '@/config/buildings';
import type { CampusPOI } from '@/config/campus3d/types';
import { searchRooms, type RoomHit } from '@/components/campus3d/CampusMap3D';
import { Spinner, TextInput, cx } from '@/components/ui';
import { ChevronRight, PhoneIcon } from '@/components/icons';

// Three.js only ever runs in the browser; the shell shows a spinner meanwhile.
const CampusMap3D = dynamic(() => import('@/components/campus3d/CampusMap3D'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Spinner label="Building the campus…" />
    </div>
  ),
});

const CampusRealMap = dynamic(() => import('@/components/campus3d/CampusRealMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Spinner label="Loading the map…" />
    </div>
  ),
});

export default function MapPage() {
  const mounted = useMounted();
  const admin = useAppStore((s) => s.admin);
  const serverData = useAppStore((s) => s.serverData);
  const [campus, setCampus] = useState<CampusInfo | null>(null);
  const [query, setQuery] = useState('');
  const [focusRoom, setFocusRoom] = useState<RoomHit | null>(null);
  const [focusPoi, setFocusPoi] = useState<string | null>(null);
  const [buildingCode, setBuildingCode] = useState<string | null>(null);
  const [editable, setEditable] = useState(false);

  // Layout editor: open /more/map?edit=1 (device-local, exports JSON).
  useEffect(() => {
    setEditable(new URLSearchParams(window.location.search).has('edit'));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchCampus().then((info) => {
      if (alive) setCampus(info);
    });
    return () => {
      alive = false;
    };
  }, [mounted]);

  const roomHits = useMemo(() => searchRooms(query), [query]);
  const listRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef(new Map<string, HTMLDivElement>());
  // A building's display name: the label set on its outline in the admin editor wins.
  const labelOf = (code: string) => {
    const name = effectiveBuildingName(serverData, admin, code);
    return name ? `${name} (${code})` : buildingLabel(code);
  };
  // Server-owned map data when reachable; seed+local overlay as the offline
  // fallback. Pins and outlines an admin hid never reach this page.
  const pois = useMemo(() => effectivePois(serverData, admin), [serverData, admin]);
  const outlines = useMemo(() => effectiveOutlines(serverData, admin), [serverData, admin]);

  // The A-to-Z list, grouped by first letter; typing filters it in place.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? pois.filter((p) => p.name.toLowerCase().includes(q)) : pois;
    const byLetter = new Map<string, CampusPOI[]>();
    for (const p of [...filtered].sort((a, b) => a.name.localeCompare(b.name))) {
      const letter = p.name[0]?.toUpperCase() ?? '#';
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), p]);
    }
    return [...byLetter.entries()];
  }, [pois, query]);

  // --- Draggable bottom sheet: collapsed (search bar only) / half / full. ---
  type SheetPos = 'collapsed' | 'half' | 'full';
  const SHEET_MIN = 96; // handle + search bar
  const [sheetPos, setSheetPos] = useState<SheetPos>('half');
  const [dragH, setDragH] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState(0);
  const dragFrom = useRef<{ y: number; h: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBodyH(el.clientHeight));
    ro.observe(el);
    setBodyH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const heightFor = (pos: SheetPos, total: number) =>
    pos === 'collapsed' ? SHEET_MIN : pos === 'half' ? Math.round(total * 0.48) : total;
  const sheetH = dragH ?? (bodyH ? heightFor(sheetPos, bodyH) : null);

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const total = bodyRef.current?.clientHeight ?? 0;
    dragFrom.current = { y: e.clientY, h: dragH ?? heightFor(sheetPos, total), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;
    if (Math.abs(e.clientY - from.y) > 6) from.moved = true;
    const total = bodyRef.current?.clientHeight ?? 0;
    setDragH(Math.min(total, Math.max(SHEET_MIN, from.h + (from.y - e.clientY))));
  };
  const onHandleUp = () => {
    const from = dragFrom.current;
    if (!from) return;
    const total = bodyRef.current?.clientHeight ?? 0;
    const h = dragH ?? heightFor(sheetPos, total);
    dragFrom.current = null;
    setDragH(null);
    if (!from.moved) {
      // A tap on the handle steps the sheet instead of dragging it.
      setSheetPos(sheetPos === 'collapsed' ? 'half' : sheetPos === 'half' ? 'full' : 'half');
      return;
    }
    const points: [SheetPos, number][] = [
      ['collapsed', SHEET_MIN],
      ['half', heightFor('half', total)],
      ['full', total],
    ];
    points.sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h));
    setSheetPos(points[0][0]);
  };

  /** Fly the map to a pin (closing any open building view). */
  const openPoi = (id: string) => {
    setBuildingCode(null);
    setFocusRoom(null);
    setFocusPoi(id);
    if (sheetPos === 'full') setSheetPos('half');
  };

  // The whole-campus view is home; picking a building dives inside it.
  const selected = buildingCode ?? 'campus';

  return (
    // One viewport, no page scroll: title bar on top, the map fills the middle,
    // and the gold sheet (search + A-to-Z list) sits at the bottom — the same
    // layout as the official app. Only the list scrolls.
    <div className="flex h-full min-h-0 flex-col">
      {/* Gold title bar. (Dark text on gold: white fails contrast here.) */}
      <div className="flex h-11 shrink-0 items-center rounded-t-card bg-gold">
        <Link
          href="/more/"
          aria-label="Back to More"
          className="tap flex h-11 w-12 items-center justify-center text-anthracite"
        >
          <ChevronRight className="h-6 w-6 rotate-180" />
        </Link>
        <span className="flex-1 text-center text-base font-bold text-anthracite">Campus Map</span>
        <span className="w-12" aria-hidden="true" />
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
      {/* The map (or an opened building's floors). */}
      <div className="relative min-h-0 flex-1 overflow-hidden border-x border-[var(--divider)] bg-[var(--surface)]">
        {!mounted ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading the map…" />
          </div>
        ) : selected !== 'campus' ? (
          <>
            <CampusMap3D building={selected} focusRoom={focusRoom} editable={editable} />
            <button
              onClick={() => {
                setBuildingCode(null);
                setFocusRoom(null);
              }}
              className="tap absolute left-2 top-2 z-[500] rounded-card bg-black/55 px-3 py-2.5 text-sm font-bold text-white shadow-md backdrop-blur"
            >
              ← Campus
            </button>
          </>
        ) : (
          <CampusRealMap
            focusPoi={focusPoi}
            pois={pois}
            outlines={outlines}
            onOpenBuilding={(code) => {
              setFocusPoi(null);
              setBuildingCode(code);
            }}
          />
        )}
      </div>

      {/* Bottom sheet: drag the handle (or tap it) to collapse to just the
          search bar, sit at half, or take over the screen — the map above
          shrinks to match. */}
      <div
        className={cx(
          'flex min-h-0 shrink-0 flex-col overflow-hidden rounded-b-card bg-gold',
          dragH === null && 'transition-[height] duration-200 ease-out',
        )}
        style={{ height: sheetH ?? '48%' }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1.5 pt-2"
          role="slider"
          aria-label="Resize the locations panel"
          aria-valuenow={sheetPos === 'collapsed' ? 0 : sheetPos === 'half' ? 50 : 100}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="h-1 w-10 rounded-full bg-anthracite/25" />
        </div>
        <div className="shrink-0 px-3 py-2">
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Locations"
            inputMode="search"
            aria-label="Search campus locations and rooms"
            onFocus={() => sheetPos === 'collapsed' && setSheetPos('half')}
            className="mt-0 border-transparent bg-white dark:bg-anthracite"
          />
        </div>
        <div className="relative min-h-0 flex-1">
          <div ref={listRef} className="h-full overflow-y-auto bg-[var(--surface)]">
            {/* Room matches (A121, Weight Room…) surface above the locations. */}
            {roomHits.length > 0 && (
              <div>
                <div className="sticky top-0 z-10 bg-gold px-3 py-1 text-sm font-bold text-anthracite">
                  Rooms
                </div>
                <ul className="divide-y divide-[var(--divider)]">
                  {roomHits.map((h) => (
                    <li key={`${h.building}-${h.room.id}`}>
                      <button
                        className="tap flex w-full items-baseline justify-between px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() => {
                          setFocusPoi(null);
                          setBuildingCode(h.building);
                          setFocusRoom(h);
                        }}
                      >
                        <span className="text-sm font-semibold text-[var(--text)]">
                          {h.room.id}
                          {h.room.label ? ` · ${h.room.label}` : ''}
                        </span>
                        <span className="text-xs text-[var(--muted)]">{labelOf(h.building)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {groups.length === 0 && roomHits.length === 0 && (
              <p className="p-4 text-sm text-[var(--muted)]">
                {query
                  ? `No locations match \u201c${query}\u201d.`
                  : 'No locations posted yet. Admins add them in the map editor.'}
              </p>
            )}
            {groups.map(([letter, items]) => (
              <div
                key={letter}
                ref={(el) => {
                  if (el) letterRefs.current.set(letter, el);
                  else letterRefs.current.delete(letter);
                }}
              >
                <div className="sticky top-0 z-10 bg-gold px-3 py-1 text-sm font-bold text-anthracite">
                  {letter}
                </div>
                <ul className="divide-y divide-[var(--divider)]">
                  {items.map((p) => (
                    <li key={p.id}>
                      <button
                        className="tap w-full px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() => openPoi(p.id)}
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {/* Campus Security, one tap, at the end of the list. */}
            {campus?.securityPhone && (
              <a
                href={telHref(campus.securityPhone)}
                className="tap flex items-center justify-center gap-2 bg-gold py-3 text-sm font-bold text-anthracite"
              >
                <PhoneIcon className="h-4 w-4" /> Campus Security {campus.securityPhone}
              </a>
            )}
          </div>
          {/* Letter rail: jumps the list to that section. Hidden while filtering. */}
          {!query && groups.length > 1 && (
            <div className="absolute inset-y-0 right-0.5 z-20 flex flex-col items-center justify-center">
              {groups.map(([letter]) => (
                <button
                  key={letter}
                  aria-label={`Jump to ${letter}`}
                  onClick={() => {
                    const el = letterRefs.current.get(letter);
                    const list = listRef.current;
                    if (el && list) list.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
                  }}
                  // NOT .tap-expand: the letters sit ~14px apart, so 48px targets
                  // would overlap and swallow each other's taps. Wider padding instead.
                  className="px-2 py-1 text-[10px] font-bold leading-none text-royal dark:text-gold"
                >
                  {letter}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
