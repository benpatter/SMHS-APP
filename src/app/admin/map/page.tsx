'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import { effectiveOutlines, effectivePois, useAppStore } from '@/lib/store';
import { SEED_OUTLINES } from '@/config/campus3d/outlines';
import { BUILDINGS_3D } from '@/config/campus3d/campus';
import type { CampusOutline, CampusPOI } from '@/config/campus3d/types';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, Field, Pill, SectionTitle, Select, Spinner, TextInput, cx } from '@/components/ui';
import { PlusIcon } from '@/components/icons';

/**
 * Campus Map editor, laid out like the official app's map screen: the live map
 * with pins up top, then the searchable A-to-Z location list. Administrators
 * add a location by tapping the map, rename/move/delete any pin, and draw,
 * reshape, or delete building outlines. Students see the changes instantly on
 * More → Campus Map.
 */

const CampusPoiEditor = dynamic(() => import('@/components/campus3d/CampusPoiEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Spinner label="Loading the map…" />
    </div>
  ),
});

/** The in-progress pin: a new one (id null) or an existing one being edited. */
interface Draft {
  id: string | null;
  name: string;
  desc: string;
  building: string;
  position: [number, number] | null;
}

/** The in-progress outline: new (id null) or an existing one being reshaped. */
interface OutlineDraft {
  id: string | null;
  label: string;
  building: string;
  points: [number, number][];
}

/**
 * Seed pins/outlines ship with the app, so a delete would just come back on the
 * next device that has never synced — they hide instead. Anything an admin drew
 * is theirs to delete outright.
 */
// No seed pins exist: every pin is admin-created and deletes outright.
const SEED_POI_IDS = new Set<string>();
const SEED_OUTLINE_IDS = new Set(SEED_OUTLINES.map((o) => o.id));

export default function AdminMapPage() {
  const admin = useAppStore((s) => s.admin);
  const serverData = useAppStore((s) => s.serverData);
  const addPoi = useAppStore((s) => s.addPoi);
  const updatePoi = useAppStore((s) => s.updatePoi);
  const deletePoi = useAppStore((s) => s.deletePoi);
  const setPoiHidden = useAppStore((s) => s.setPoiHidden);
  const addOutline = useAppStore((s) => s.addOutline);
  const updateOutline = useAppStore((s) => s.updateOutline);
  const deleteOutline = useAppStore((s) => s.deleteOutline);
  const setOutlineHidden = useAppStore((s) => s.setOutlineHidden);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(null);
  const [outlineDraft, setOutlineDraft] = useState<OutlineDraft | null>(null);

  // Server-owned lists when reachable; seed+local overlay as the offline fallback.
  // Hidden items stay listed here, greyed out, so they can be restored.
  const pois = useMemo(
    () =>
      effectivePois(serverData, admin, { includeHidden: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [serverData, admin],
  );
  const outlines = useMemo(
    () => effectiveOutlines(serverData, admin, { includeHidden: true }),
    [serverData, admin],
  );
  const adminIds = useMemo(() => new Set(admin.pois.map((p) => p.id)), [admin.pois]);
  const adminOutlineIds = useMemo(() => new Set(admin.outlines.map((o) => o.id)), [admin.outlines]);
  // Greyed out on the map itself, matching the list.
  const hiddenPoiIds = useMemo(() => pois.filter((p) => p.hidden).map((p) => p.id), [pois]);
  const hiddenOutlineIds = useMemo(() => outlines.filter((o) => o.hidden).map((o) => o.id), [outlines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? pois.filter((p) => p.name.toLowerCase().includes(q)) : pois;
  }, [pois, query]);

  // A-to-Z sections, like the official app's location list.
  const groups = useMemo(() => {
    const byLetter = new Map<string, CampusPOI[]>();
    for (const p of filtered) {
      const letter = p.name[0]?.toUpperCase() ?? '#';
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), p]);
    }
    return [...byLetter.entries()];
  }, [filtered]);

  const listRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef(new Map<string, HTMLDivElement>());

  const closeEditors = () => {
    setDraft(null);
    setOutlineDraft(null);
    setSelectedOutlineId(null);
  };

  const openEditor = (poi: CampusPOI) => {
    closeEditors();
    setSelectedId(poi.id);
    setDraft({
      id: poi.id,
      name: poi.name,
      desc: poi.desc ?? '',
      building: poi.building ?? '',
      position: poi.position,
    });
  };

  const openOutlineEditor = (o: CampusOutline) => {
    closeEditors();
    setSelectedId(null);
    setSelectedOutlineId(o.id);
    setOutlineDraft({ id: o.id, label: o.label ?? '', building: o.building ?? '', points: o.points });
  };

  const save = () => {
    if (!draft || !draft.name.trim() || !draft.position) return;
    const patch = {
      name: draft.name.trim(),
      desc: draft.desc.trim() || undefined,
      building: draft.building || undefined,
      position: draft.position,
    };
    if (draft.id) updatePoi(draft.id, patch);
    else addPoi(patch);
    setDraft(null);
  };

  const saveOutline = () => {
    if (!outlineDraft || outlineDraft.points.length < 3) return;
    const patch = {
      label: outlineDraft.label.trim() || undefined,
      building: outlineDraft.building || undefined,
      points: outlineDraft.points,
    };
    if (outlineDraft.id) updateOutline(outlineDraft.id, patch);
    else addOutline(patch);
    closeEditors();
  };

  const draftPoi = draft?.id ? pois.find((p) => p.id === draft.id) : undefined;
  const draftOutlineHidden = Boolean(
    outlineDraft?.id && outlines.find((o) => o.id === outlineDraft.id)?.hidden,
  );
  const outlineName = (o: CampusOutline) => o.label ?? (o.building ? `Building ${o.building}` : 'Outline');

  return (
    <AdminGate title="Campus Map">
      <p className="text-sm text-[var(--muted)]">
        Add and edit the pins and building outlines students see on More → Campus Map. Tap a pin
        (then its name card) or an outline to edit it.
      </p>

      <div className="overflow-hidden rounded-card border border-[var(--divider)] shadow-sm">
        <div className="h-[42vh] min-h-[320px]">
          <CampusPoiEditor
            pois={pois}
            hiddenIds={hiddenPoiIds}
            selectedId={draft ? null : selectedId}
            picking={Boolean(draft)}
            draftPosition={draft?.position ?? null}
            onSelect={setSelectedId}
            onInfo={(id) => {
              const poi = pois.find((p) => p.id === id);
              if (poi) openEditor(poi);
            }}
            onPick={(world) => setDraft((d) => (d ? { ...d, position: world } : d))}
            outlines={outlines}
            hiddenOutlineIds={hiddenOutlineIds}
            selectedOutlineId={selectedOutlineId}
            outlineDraftPoints={outlineDraft?.points ?? null}
            onSelectOutline={(id) => {
              if (id === null) {
                if (!outlineDraft) setSelectedOutlineId(null);
                return;
              }
              const o = outlines.find((x) => x.id === id);
              if (o) openOutlineEditor(o);
            }}
            onOutlineDraftChange={(points) =>
              setOutlineDraft((d) => (d ? { ...d, points } : d))
            }
          />
        </div>
      </div>

      {!draft && !outlineDraft && (
        <div className="flex gap-2">
          <Button
            variant="gold"
            className="flex-1"
            onClick={() => {
              setSelectedId(null);
              setSelectedOutlineId(null);
              setDraft({ id: null, name: '', desc: '', building: '', position: null });
            }}
          >
            <PlusIcon className="h-5 w-5" /> Location
          </Button>
          <Button
            variant="gold"
            className="flex-1"
            onClick={() => {
              setSelectedId(null);
              setSelectedOutlineId(null);
              setOutlineDraft({ id: null, label: '', building: '', points: [] });
            }}
          >
            <PlusIcon className="h-5 w-5" /> Outline
          </Button>
        </div>
      )}

      {outlineDraft && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold text-[var(--text)]">
            {outlineDraft.id ? `Editing outline: ${outlineDraft.label || outlineDraft.id}` : 'New outline'}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {outlineDraft.points.length < 3
              ? `Tap the map to add corners (${outlineDraft.points.length}/3 minimum).`
              : 'Drag the square corners to reshape. Tap the map to add more corners.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Label (optional)" hint="On a building outline this renames the building in the map picker, interiors, and schedules.">
              <TextInput
                value={outlineDraft.label}
                onChange={(e) => setOutlineDraft({ ...outlineDraft, label: e.target.value })}
                placeholder="New gym"
              />
            </Field>
            <Field label="Opens which building?">
              <Select
                value={outlineDraft.building}
                onChange={(e) => setOutlineDraft({ ...outlineDraft, building: e.target.value })}
              >
                <option value="">None</option>
                {BUILDINGS_3D.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={outlineDraft.points.length < 3} onClick={saveOutline}>
              {outlineDraft.id ? 'Save outline' : 'Add outline'}
            </Button>
            <Button
              variant="outline"
              disabled={outlineDraft.points.length === 0}
              onClick={() =>
                setOutlineDraft({ ...outlineDraft, points: outlineDraft.points.slice(0, -1) })
              }
            >
              Undo corner
            </Button>
            <Button variant="ghost" onClick={closeEditors}>
              Cancel
            </Button>
          </div>
          {outlineDraft.id &&
            (SEED_OUTLINE_IDS.has(outlineDraft.id) ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setOutlineHidden(outlineDraft.id!, !draftOutlineHidden);
                  closeEditors();
                }}
              >
                {draftOutlineHidden ? 'Show this outline again' : 'Hide this outline'}
              </Button>
            ) : (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  deleteOutline(outlineDraft.id!);
                  closeEditors();
                }}
              >
                Delete this outline
              </Button>
            ))}
        </Card>
      )}

      {draft && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold text-[var(--text)]">
            {draft.id ? `Editing: ${draftPoi?.name ?? draft.name}` : 'New location'}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {draft.position
              ? 'Pin placed. Tap the map again to move it.'
              : 'Tap the map where the pin should go.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Robotics Lab"
              />
            </Field>
            <Field label="Detail (optional)">
              <TextInput
                value={draft.desc}
                onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
                placeholder="2nd floor"
              />
            </Field>
          </div>
          <Field label="Opens which building?" hint="Links the pin to the floor-by-floor viewer.">
            <Select
              value={draft.building}
              onChange={(e) => setDraft({ ...draft, building: e.target.value })}
            >
              <option value="">None</option>
              {BUILDINGS_3D.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} · {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!draft.name.trim() || !draft.position} onClick={save}>
              {draft.id ? 'Save changes' : 'Add to the map'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
          {draft.id &&
            (SEED_POI_IDS.has(draft.id) ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setPoiHidden(draft.id!, !draftPoi?.hidden);
                  setDraft(null);
                }}
              >
                {draftPoi?.hidden ? 'Show this location again' : 'Hide this location'}
              </Button>
            ) : (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  deletePoi(draft.id!);
                  setDraft(null);
                  setSelectedId(null);
                }}
              >
                Delete this location
              </Button>
            ))}
        </Card>
      )}

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Locations"
        inputMode="search"
      />

      {/* The A-to-Z location list with its letter rail, like the official app. */}
      <div className="relative">
        <div
          ref={listRef}
          className="relative max-h-[44vh] overflow-y-auto rounded-card border border-[var(--divider)] bg-[var(--surface)]"
        >
          {groups.length === 0 && (
            <p className="p-4 text-sm text-[var(--muted)]">No locations match “{query}”.</p>
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
                  // The edit affordance is a SIBLING button, not a nested one —
                  // a button inside a button is invalid and unreachable by keyboard.
                  <li
                    key={p.id}
                    className={cx(
                      'flex items-center',
                      selectedId === p.id && 'bg-royal/10',
                      p.hidden && 'opacity-60',
                    )}
                  >
                    <button
                      onClick={() => {
                        closeEditors();
                        setSelectedId(selectedId === p.id ? null : p.id);
                      }}
                      className="tap flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                        {p.name}
                      </span>
                      {p.hidden && <Pill tone="muted">Hidden</Pill>}
                      {adminIds.has(p.id) && <Pill tone="gold">Added</Pill>}
                      {admin.poiEdits[p.id] && !adminIds.has(p.id) && <Pill tone="gold">Edited</Pill>}
                    </button>
                    <button
                      aria-label={`Edit ${p.name}`}
                      onClick={() => openEditor(p)}
                      className="tap flex shrink-0 items-center justify-center pl-1 pr-3 hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-royal/50 font-serif text-sm font-bold italic text-royal dark:border-gold/60 dark:text-gold">
                        i
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Letter rail: jumps the list to that section. */}
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
                // NOT .tap-expand: 20+ letters sit ~14px apart, so 48px targets
                // would overlap and the later letter's target would swallow the
                // earlier one's taps. Widened padding instead.
                className="px-2 py-1 text-[10px] font-bold leading-none text-royal dark:text-gold"
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Every outline on the map: tap to reshape, relabel, or delete. */}
      <section className="space-y-2">
        <SectionTitle>Outlines</SectionTitle>
        <Card className="divide-y divide-[var(--divider)]">
          {outlines.map((o) => (
            <button
              key={o.id}
              onClick={() => openOutlineEditor(o)}
              className={cx(
                'tap flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5',
                selectedOutlineId === o.id && 'bg-royal/10',
                o.hidden && 'opacity-60',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                {outlineName(o)}
              </span>
              {o.hidden && <Pill tone="muted">Hidden</Pill>}
              {adminOutlineIds.has(o.id) && <Pill tone="gold">Added</Pill>}
              {admin.outlineEdits[o.id] && !adminOutlineIds.has(o.id) && <Pill tone="gold">Edited</Pill>}
            </button>
          ))}
        </Card>
      </section>
    </AdminGate>
  );
}
