'use client';

/**
 * Real satellite campus map, done the way the official SMHS app does it:
 * imagery with tappable location pins and a details card, plus our own
 * clickable building footprints that open the floor-by-floor 3D viewer.
 * Leaflet + Esri World Imagery served through our own tile cache (the
 * basemap never changes, so the server fetches each tile once and every
 * device gets it from us), pins and outlines are geo-referenced from the
 * site plan via campus3d/geo.
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { API_BASE } from '@/config/api';
import { useEffect, useRef, useState } from 'react';
import { BUILDINGS_3D } from '@/config/campus3d/campus';
import { worldToLatLng } from '@/config/campus3d/geo';
import { SEED_OUTLINES } from '@/config/campus3d/outlines';
import type { CampusOutline, CampusPOI } from '@/config/campus3d/types';

const IMAGERY_URL = `${API_BASE}/api/tiles/sat/{z}/{x}/{y}`;
const IMAGERY_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';
const STREET_URL = `${API_BASE}/api/tiles/osm/{z}/{x}/{y}`;
const STREET_ATTRIBUTION = '© OpenStreetMap contributors';

/** Gold location pin, sized for thumbs (48px hit area, smaller visual). */
function poiIcon(selected: boolean): L.DivIcon {
  const size = selected ? 22 : 15;
  const color = selected ? '#1a4784' : '#b4a365';
  return L.divIcon({
    className: '',
    html: `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">
      <div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};
        border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.55)"></div></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

/** Letter chip marking a building that opens in the 3D viewer. */
export function buildingIcon(code: string): L.DivIcon {
  // The box grows with the text (Leaflet clips to iconSize) — ~9px per bold
  // 14px char, padded; anchor stays centered.
  const w = Math.max(48, code.length * 9 + 20);
  return L.divIcon({
    className: '',
    html: `<div style="width:${w}px;height:48px;display:flex;align-items:center;justify-content:center">
      <div style="min-width:26px;height:26px;padding:0 6px;border-radius:8px;background:#1a4784;
        border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.55);display:flex;align-items:center;
        justify-content:center;color:#fff;font:800 14px system-ui,sans-serif;white-space:nowrap">${code}</div></div>`,
    iconSize: [w, 48],
    iconAnchor: [w / 2, 24],
  });
}

export default function CampusRealMap({
  focusPoi,
  onOpenBuilding,
  pois = [],
  outlines = SEED_OUTLINES,
}: {
  /** POI id to fly to and select (from the page's search). */
  focusPoi?: string | null;
  /** Called when a building with an interior viewer is chosen. */
  onOpenBuilding: (code: string) => void;
  /** Pin list to render (the server-owned list; empty until admins add pins). */
  pois?: CampusPOI[];
  /** Outlines to render (pass the seed+admin merge); defaults to the seed. */
  outlines?: CampusOutline[];
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{ satellite: L.TileLayer; street: L.TileLayer } | null>(null);
  const [streetView, setStreetView] = useState(false);
  const poiMarkers = useRef<Map<string, L.Marker>>(new Map());
  const outlinePolys = useRef<L.Polygon[]>([]);
  const outlineIcons = useRef<L.Marker[]>([]);
  const [selected, setSelected] = useState<CampusPOI | null>(null);
  const selectedRef = useRef<CampusPOI | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = L.map(holder.current, {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 20,
    });
    mapRef.current = map;
    map.attributionControl.setPrefix(false);
    if (process.env.NODE_ENV !== 'production') {
      // Calibration aid: lets devtools read positions off the live map.
      (window as unknown as Record<string, unknown>).__campusMap = map;
    }
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

    // Frame the whole campus on open (fall back to the geo anchor if empty).
    if (pois.length) {
      map.fitBounds(L.latLngBounds(pois.map((p) => worldToLatLng(p.position))).pad(0.12));
    } else {
      map.setView(worldToLatLng([-16, 6]), 17);
    }

    map.on('click', () => setSelected(null));

    // The holder resizes as the bottom sheet drags — keep Leaflet in sync.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(holder.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      poiMarkers.current.clear();
    };
    // The map is built once; markers navigate via state, not props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outlines rebuild whenever the list changes (admins reshape/hide them live).
  // The building letter chip sits on ITS outline's center — an outline with no
  // building link gets no chip, and a building with no outline gets none either.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const poly of outlinePolys.current) poly.remove();
    outlinePolys.current = [];
    for (const icon of outlineIcons.current) icon.remove();
    outlineIcons.current = [];
    for (const o of outlines) {
      const poly = L.polygon(o.points.map(worldToLatLng), {
        color: '#ffffff',
        weight: 2,
        opacity: 0.9,
        fillColor: '#1a4784',
        fillOpacity: 0.28,
      }).addTo(map);
      if (o.building) poly.on('click', () => onOpenBuilding(o.building!));
      outlinePolys.current.push(poly);
      // A labeled outline shows its chip even without a building link (the
      // editor already does); only linked ones open the floor viewer on tap.
      if ((o.label || o.building) && o.points.length) {
        const cx = o.points.reduce((n, p) => n + p[0], 0) / o.points.length;
        const cz = o.points.reduce((n, p) => n + p[1], 0) / o.points.length;
        const marker = L.marker(worldToLatLng([cx, cz]), {
          icon: buildingIcon(o.label ?? o.building!),
          keyboard: false,
        }).addTo(map);
        if (o.building) marker.on('click', () => onOpenBuilding(o.building!));
        outlineIcons.current.push(marker);
      }
    }
    // onOpenBuilding is an inline prop; outlines alone drive the rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlines]);

  // Pins rebuild whenever the list changes (admins add/move/hide pins live).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of poiMarkers.current.values()) marker.remove();
    poiMarkers.current.clear();
    for (const poi of pois) {
      const marker = L.marker(worldToLatLng(poi.position), {
        icon: poiIcon(poi.id === selectedRef.current?.id),
        keyboard: false,
      })
        .addTo(map)
        .on('click', () => {
          setSelected(selectedRef.current?.id === poi.id ? null : poi);
        });
      poiMarkers.current.set(poi.id, marker);
    }
    // Keep the selected card in sync if its pin was edited or removed.
    setSelected((cur) => (cur ? (pois.find((p) => p.id === cur.id) ?? null) : cur));
  }, [pois]);

  // Swap icons so the selected pin reads selected.
  useEffect(() => {
    for (const [id, marker] of poiMarkers.current) {
      marker.setIcon(poiIcon(id === selected?.id));
    }
    if (selected && mapRef.current) {
      mapRef.current.flyTo(worldToLatLng(selected.position), Math.max(mapRef.current.getZoom(), 18), {
        duration: 0.6,
      });
    }
  }, [selected]);

  // Satellite <-> street toggle (the layers button).
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    if (streetView) {
      map.removeLayer(layers.satellite);
      layers.street.addTo(map);
    } else {
      map.removeLayer(layers.street);
      layers.satellite.addTo(map);
    }
  }, [streetView]);

  useEffect(() => {
    if (!focusPoi) return;
    setSelected(pois.find((p) => p.id === focusPoi) ?? null);
    // Only a new focus request should re-select, not a background pois refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoi]);

  const selectedBuilding = selected?.building
    ? BUILDINGS_3D.find((b) => b.code === selected.building)
    : undefined;

  return (
    // `isolate` fences Leaflet's z-indexed panes (100–1000) into this box so
    // they can't paint over app overlays like the welcome screen (z-50).
    <div className="isolate relative h-full w-full overflow-hidden">
      <div ref={holder} className="h-full w-full" />
      {/* Floating controls, official-app style: locate left, layers right. */}
      <button
        aria-label="Show my location"
        onClick={() => mapRef.current?.locate({ setView: true, maxZoom: 18 })}
        className="tap absolute left-2 top-2 z-[500] flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" strokeLinecap="round" />
        </svg>
      </button>
      <button
        aria-label={streetView ? 'Switch to satellite view' : 'Switch to street view'}
        onClick={() => setStreetView((v) => !v)}
        className="tap absolute right-2 top-2 z-[500] flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 3.5 21 9l-9 5.5L3 9l9-5.5Z" />
          <path d="m4.8 13.2-1.8 1.1 9 5.5 9-5.5-1.8-1.1" strokeLinecap="round" />
        </svg>
      </button>
      {selected && (
        <div className="absolute inset-x-3 bottom-3 z-[500] rounded-card border border-[var(--divider)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur">
          <p className="text-base font-bold text-[var(--text)]">{selected.name}</p>
          <p className="text-xs text-[var(--muted)]">
            {selected.desc ?? (selectedBuilding ? selectedBuilding.name : 'Campus location')}
          </p>
          {selectedBuilding && (
            <button
              onClick={() => onOpenBuilding(selectedBuilding.code)}
              className="tap mt-2 min-h-12 w-full rounded-card bg-royal text-sm font-bold text-white"
            >
              See floors & rooms
            </button>
          )}
        </div>
      )}
    </div>
  );
}
