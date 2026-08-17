'use client';

/**
 * The admin map: the same Esri imagery as the student map, but for placing and
 * moving location pins. Every location renders as a gold dot (grey when hidden);
 * the selected one becomes the classic red pin with a white name callout, and
 * tapping the callout opens the edit form. While the editor form is open, a map
 * tap places (or moves) the pin instead of selecting.
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { API_BASE } from '@/config/api';
import { useEffect, useRef, useState } from 'react';
import { latLngToWorld, worldToLatLng } from '@/config/campus3d/geo';
import type { CampusOutline, CampusPOI } from '@/config/campus3d/types';
import { buildingIcon } from './CampusRealMap';

const IMAGERY_URL = `${API_BASE}/api/tiles/sat/{z}/{x}/{y}`;
const IMAGERY_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';
const STREET_URL = `${API_BASE}/api/tiles/osm/{z}/{x}/{y}`;
const STREET_ATTRIBUTION = '© OpenStreetMap contributors';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Small dot for unselected locations (48px hit area, like the student map). */
function dotIcon(hidden: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">
      <div style="width:15px;height:15px;border-radius:9999px;background:${hidden ? '#9aa1ab' : '#b4a365'};
        opacity:${hidden ? 0.6 : 1};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.55)"></div></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

/** The classic red map pin, for the selected location and the draft pin. */
function redPinIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">
      <path d="M17 43C17 43 32 24.6 32 15.9 32 7.7 25.3 1 17 1 8.7 1 2 7.7 2 15.9 2 24.6 17 43 17 43Z" fill="#e0442f" stroke="#a92d1e"/>
      <circle cx="17" cy="15.5" r="5.5" fill="#8f2417"/>
    </svg>`,
    iconSize: [34, 44],
    iconAnchor: [17, 43],
    tooltipAnchor: [0, -46],
  });
}

/** Draggable corner handle for the outline being edited. */
function cornerIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center">
      <div style="width:13px;height:13px;border-radius:3px;background:#fff;border:2.5px solid #1a4784;
        box-shadow:0 1px 4px rgba(0,0,0,.55)"></div></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export default function CampusPoiEditor({
  pois,
  hiddenIds,
  selectedId,
  picking,
  draftPosition,
  onSelect,
  onInfo,
  onPick,
  outlines,
  hiddenOutlineIds,
  selectedOutlineId,
  outlineDraftPoints,
  onSelectOutline,
  onOutlineDraftChange,
}: {
  /** Merged seed+admin list, hidden pins included (they render greyed). */
  pois: CampusPOI[];
  hiddenIds: string[];
  selectedId: string | null;
  /** When true, a map tap places the pin instead of selecting/deselecting. */
  picking: boolean;
  /** World [x, z] of the in-progress pin, shown as a red draft pin. */
  draftPosition: [number, number] | null;
  onSelect: (id: string | null) => void;
  /** The selected pin's callout was tapped: open the editor for it. */
  onInfo: (id: string) => void;
  /** A map tap while picking, already converted to world [x, z]. */
  onPick: (world: [number, number]) => void;
  /** Merged seed+admin outlines, deleted included (they render greyed). */
  outlines: CampusOutline[];
  hiddenOutlineIds: string[];
  /** Outline being edited; its normal polygon hides while a draft is active. */
  selectedOutlineId: string | null;
  /** Corners of the outline being drawn/reshaped. Non-null = outline mode: map taps add corners. */
  outlineDraftPoints: [number, number][] | null;
  /** An outline was tapped (idle mode): open its editor. */
  onSelectOutline: (id: string | null) => void;
  /** The draft corners changed (tap added one, or a handle was dragged). */
  onOutlineDraftChange: (points: [number, number][]) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const draftMarker = useRef<L.Marker | null>(null);
  const outlinePolys = useRef<L.Polygon[]>([]);
  const outlineIcons = useRef<L.Marker[]>([]);
  const outlineDraftLayers = useRef<L.Layer[]>([]);
  const hadOutlineDraft = useRef(false);
  const locateMarker = useRef<L.CircleMarker | null>(null);
  const layersRef = useRef<{ satellite: L.TileLayer; street: L.TileLayer } | null>(null);
  const [layer, setLayer] = useState<'satellite' | 'street'>('satellite');

  // Stable refs so the once-built map always calls the latest handlers.
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const outlineDraftRef = useRef(outlineDraftPoints);
  outlineDraftRef.current = outlineDraftPoints;
  const onSelectOutlineRef = useRef(onSelectOutline);
  onSelectOutlineRef.current = onSelectOutline;
  const onOutlineDraftChangeRef = useRef(onOutlineDraftChange);
  onOutlineDraftChangeRef.current = onOutlineDraftChange;

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = L.map(holder.current, {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 20,
    });
    mapRef.current = map;
    map.attributionControl.setPrefix(false);
    layersRef.current = {
      satellite: L.tileLayer(IMAGERY_URL, {
        attribution: IMAGERY_ATTRIBUTION,
        maxNativeZoom: 19,
        maxZoom: 20,
      }),
      street: L.tileLayer(STREET_URL, {
        attribution: STREET_ATTRIBUTION,
        maxNativeZoom: 19,
        maxZoom: 20,
      }),
    };
    layersRef.current.satellite.addTo(map);

    if (pois.length) {
      map.fitBounds(L.latLngBounds(pois.map((p) => worldToLatLng(p.position))).pad(0.12));
    } else {
      map.setView(worldToLatLng([-16, 6]), 17);
    }

    map.on('click', (e) => {
      const world = latLngToWorld([e.latlng.lat, e.latlng.lng]);
      if (outlineDraftRef.current) {
        onOutlineDraftChangeRef.current([...outlineDraftRef.current, world]);
      } else if (pickingRef.current) {
        onPickRef.current(world);
      } else {
        onSelectRef.current(null);
        onSelectOutlineRef.current(null);
      }
    });
    map.on('locationfound', (e) => {
      locateMarker.current?.remove();
      locateMarker.current = L.circleMarker(e.latlng, {
        radius: 7,
        color: '#fff',
        weight: 2.5,
        fillColor: '#2a6fdb',
        fillOpacity: 1,
      }).addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markers.current = [];
      draftMarker.current = null;
      outlinePolys.current = [];
      outlineDraftLayers.current = [];
      locateMarker.current = null;
    };
    // Built once; pins live in their own effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild outlines on any list/selection change. The one being reshaped is
  // skipped: the draft layers below render it instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const poly of outlinePolys.current) poly.remove();
    outlinePolys.current = [];
    for (const icon of outlineIcons.current) icon.remove();
    outlineIcons.current = [];
    const hidden = new Set(hiddenOutlineIds);
    const editingId = outlineDraftPoints ? selectedOutlineId : null;
    for (const o of outlines) {
      if (o.id === editingId) continue;
      const isHidden = hidden.has(o.id);
      const poly = L.polygon(o.points.map(worldToLatLng), {
        color: isHidden ? '#9aa1ab' : '#ffffff',
        weight: o.id === selectedOutlineId ? 3 : 1.5,
        opacity: isHidden ? 0.5 : 0.85,
        dashArray: isHidden ? '6 6' : undefined,
        fillColor: '#1a4784',
        fillOpacity: isHidden ? 0.06 : 0.18,
      })
        .addTo(map)
        .on('click', (e) => {
          // In placement/drawing modes the tap falls through to the map handler.
          if (outlineDraftRef.current || pickingRef.current) return;
          e.originalEvent.stopPropagation();
          onSelectOutlineRef.current(o.id);
        });
      outlinePolys.current.push(poly);

      // The same blue letter chip the student map uses, at the outline's
      // center — the friendly tap target for editing it.
      const cx = o.points.reduce((n, p) => n + p[0], 0) / o.points.length;
      const cz = o.points.reduce((n, p) => n + p[1], 0) / o.points.length;
      const chip = L.marker(worldToLatLng([cx, cz]), {
        icon: buildingIcon(o.label ?? o.building ?? '?'),
        opacity: isHidden ? 0.5 : 1,
      })
        .addTo(map)
        .on('click', (e) => {
          if (outlineDraftRef.current || pickingRef.current) return;
          e.originalEvent.stopPropagation();
          onSelectOutlineRef.current(o.id);
        });
      outlineIcons.current.push(chip);
    }
  }, [outlines, hiddenOutlineIds, selectedOutlineId, outlineDraftPoints]);

  // The outline draft: gold preview shape + draggable corner handles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of outlineDraftLayers.current) map.removeLayer(layer);
    outlineDraftLayers.current = [];
    const points = outlineDraftPoints;
    if (!points) {
      hadOutlineDraft.current = false;
      return;
    }
    const latlngs = points.map(worldToLatLng);
    if (points.length >= 3) {
      outlineDraftLayers.current.push(
        L.polygon(latlngs, {
          color: '#b4a365',
          weight: 3,
          dashArray: '8 6',
          fillColor: '#b4a365',
          fillOpacity: 0.18,
          interactive: false,
        }).addTo(map),
      );
    } else if (points.length === 2) {
      outlineDraftLayers.current.push(
        L.polyline(latlngs, { color: '#b4a365', weight: 3, dashArray: '8 6', interactive: false }).addTo(map),
      );
    }
    points.forEach((_, i) => {
      const handle = L.marker(latlngs[i], {
        icon: cornerIcon(),
        draggable: true,
        keyboard: false,
        zIndexOffset: 3000,
      })
        .addTo(map)
        .on('dragend', () => {
          const ll = handle.getLatLng();
          const next = [...(outlineDraftRef.current ?? [])];
          next[i] = latLngToWorld([ll.lat, ll.lng]);
          onOutlineDraftChangeRef.current(next);
        });
      outlineDraftLayers.current.push(handle);
    });
    // Opening an existing outline frames it once; added corners don't re-frame.
    if (!hadOutlineDraft.current && points.length >= 3) {
      map.fitBounds(L.latLngBounds(latlngs).pad(0.4));
    }
    hadOutlineDraft.current = true;
  }, [outlineDraftPoints]);

  // Rebuild pins on any list/selection change (~40 markers, cheap).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markers.current) m.remove();
    markers.current = [];
    const hidden = new Set(hiddenIds);
    for (const poi of pois) {
      const isSelected = poi.id === selectedId;
      const marker = L.marker(worldToLatLng(poi.position), {
        icon: isSelected ? redPinIcon() : dotIcon(hidden.has(poi.id)),
        keyboard: false,
        zIndexOffset: isSelected ? 1000 : 0,
      })
        .addTo(map)
        .on('click', () => {
          // In placement/drawing modes pin taps are inert.
          if (pickingRef.current || outlineDraftRef.current) return;
          onSelectRef.current(isSelected ? null : poi.id);
        });
      if (isSelected) {
        marker.bindTooltip(
          `<span style="display:inline-flex;align-items:center;gap:8px;font:600 15px/1.2 system-ui,sans-serif;color:#1c1c1e">
            ${esc(poi.name)}
            <span style="display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;
              border-radius:9999px;border:1.5px solid #2a6fdb;color:#2a6fdb;font:italic 700 12px Georgia,serif">i</span>
          </span>`,
          { permanent: true, direction: 'top', interactive: true, className: 'poi-callout' },
        );
        marker.openTooltip();
        marker
          .getTooltip()
          ?.getElement()
          ?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            onInfoRef.current(poi.id);
          });
      }
      markers.current.push(marker);
    }
  }, [pois, hiddenIds, selectedId]);

  // Fly to a newly selected pin.
  useEffect(() => {
    const map = mapRef.current;
    const poi = pois.find((p) => p.id === selectedId);
    if (!map || !poi) return;
    map.flyTo(worldToLatLng(poi.position), Math.max(map.getZoom(), 18), { duration: 0.6 });
    // Selection drives the flight; a pois refresh alone shouldn't re-fly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // The red draft pin while placing/moving.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    draftMarker.current?.remove();
    draftMarker.current = null;
    if (draftPosition) {
      draftMarker.current = L.marker(worldToLatLng(draftPosition), {
        icon: redPinIcon(),
        keyboard: false,
        interactive: false,
        zIndexOffset: 2000,
      }).addTo(map);
      map.flyTo(worldToLatLng(draftPosition), Math.max(map.getZoom(), 18), { duration: 0.4 });
    }
  }, [draftPosition]);

  // Crosshair cursor while a tap will place a pin or add a corner.
  useEffect(() => {
    const el = mapRef.current?.getContainer();
    if (el) el.style.cursor = picking || outlineDraftPoints ? 'crosshair' : '';
  }, [picking, outlineDraftPoints]);

  return (
    // `isolate` fences Leaflet's z-indexed panes (100–1000) into this box so
    // they can't paint over app overlays like the welcome screen (z-50).
    <div className="isolate relative h-full w-full overflow-hidden">
      <div ref={holder} className="h-full w-full" />
      {/* Locate + layer toggle, the two round controls from the official app. */}
      <button
        aria-label="Show my location"
        onClick={() => mapRef.current?.locate({ setView: true, maxZoom: 18 })}
        className="tap absolute left-3 top-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      </button>
      <button
        aria-label="Switch map style"
        onClick={() => {
          const map = mapRef.current;
          const layers = layersRef.current;
          if (!map || !layers) return;
          const next = layer === 'satellite' ? 'street' : 'satellite';
          layers[layer].remove();
          layers[next].addTo(map);
          setLayer(next);
        }}
        className="tap absolute right-3 top-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 3 3 8l9 5 9-5-9-5Z" />
          <path d="m3 13 9 5 9-5" />
        </svg>
      </button>
      {(picking || outlineDraftPoints) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center">
          <span className="rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            {outlineDraftPoints
              ? outlineDraftPoints.length < 3
                ? 'Tap the map to add corners (3 or more)'
                : 'Tap for more corners · drag a corner to reshape'
              : draftPosition
                ? 'Tap the map to move the pin'
                : 'Tap the map to place the pin'}
          </span>
        </div>
      )}
    </div>
  );
}
