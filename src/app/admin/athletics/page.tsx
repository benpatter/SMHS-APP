'use client';

import { useEffect, useState } from 'react';
import type { SchoolEvent } from '@/config/calendar';
import { applyAthleticsEdits, useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { fetchLiveEvents } from '@/lib/providers/live';
import { AdminGate } from '@/components/AdminGate';
import { EventRow } from '@/components/AthleticsRows';
import {
  Button,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  Segmented,
  Spinner,
  TextInput,
} from '@/components/ui';
import { nowInSchoolTz } from '@/lib/time';
import { PencilIcon } from '@/components/icons';

/**
 * Edit one event: rename it, set the time, the field it's played on, and the
 * event location (the badge — "Home", an opponent school, or blank for no
 * badge). Saves go to the shared server list, so every device sees them.
 */
function EventEditor({ e, onDone }: { e: SchoolEvent; onDone: () => void }) {
  const updateAthleticsEvent = useAppStore((s) => s.updateAthleticsEvent);
  const deleteAthleticsEvent = useAppStore((s) => s.deleteAthleticsEvent);
  const [title, setTitle] = useState(e.title);
  const [time, setTime] = useState(e.time ?? '');
  const [location, setLocation] = useState(e.location ?? '');
  const [venue, setVenue] = useState(e.venue ?? '');

  return (
    <div className="space-y-3 border-t border-[var(--divider)] bg-black/[0.02] px-4 py-4 dark:bg-white/[0.02]">
      <Field label="Event name">
        <TextInput value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder={e.title} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Time">
          <TextInput value={time} onChange={(ev) => setTime(ev.target.value)} placeholder="3:00 PM" />
        </Field>
        <Field label="Field location">
          <TextInput
            value={location}
            onChange={(ev) => setLocation(ev.target.value)}
            placeholder="Aquatics Center"
          />
        </Field>
      </div>
      <Field label="Event location">
        <TextInput
          value={venue}
          onChange={(ev) => setVenue(ev.target.value)}
          placeholder="Home, or the host school — blank for no badge"
        />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1"
          onClick={() => {
            updateAthleticsEvent(e.id, {
              title: title.trim(),
              time: time.trim(),
              location: location.trim(),
              venue: venue.trim(),
            });
            onDone();
          }}
        >
          Save
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            deleteAthleticsEvent(e.id);
            onDone();
          }}
        >
          Delete
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Create a new event on the shared server list. Same fields as the editor, plus the date. */
function AddEventForm({ onDone }: { onDone: () => void }) {
  const addAthleticsEvent = useAppStore((s) => s.addAthleticsEvent);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => nowInSchoolTz().toFormat('yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [venue, setVenue] = useState('');

  return (
    <Card className="space-y-3 p-4">
      <Field label="Event name">
        <TextInput
          autoFocus
          value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          placeholder="B V WP vs Crean"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <TextInput type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
        <Field label="Time">
          <TextInput value={time} onChange={(ev) => setTime(ev.target.value)} placeholder="3:00 PM" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Field location">
          <TextInput
            value={location}
            onChange={(ev) => setLocation(ev.target.value)}
            placeholder="Aquatics Center"
          />
        </Field>
        <Field label="Event location">
          <TextInput
            value={venue}
            onChange={(ev) => setVenue(ev.target.value)}
            placeholder="Home, or the host school"
          />
        </Field>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1"
          disabled={!title.trim() || !date}
          onClick={() => {
            addAthleticsEvent({
              date,
              title: title.trim(),
              category: 'athletics',
              time: time.trim() || undefined,
              location: location.trim() || undefined,
              venue: venue.trim() || undefined,
            });
            onDone();
          }}
        >
          Add event
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export default function AdminAthleticsPage() {
  const mounted = useMounted();
  const serverData = useAppStore((s) => s.serverData);
  const updateAthleticsEvent = useAppStore((s) => s.updateAthleticsEvent);
  const todayIso = nowInSchoolTz().toFormat('yyyy-MM-dd');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Past events are reachable too: a game that already happened still gets
  // corrected or hidden.
  const [range, setRange] = useState<'upcoming' | 'all'>('upcoming');

  // The same live feed every device sees, with the shared edits applied.
  const [liveGames, setLiveGames] = useState<SchoolEvent[] | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchLiveEvents().then((evts) => {
      if (!alive) return;
      setLiveGames(evts ? evts.filter((e) => e.category === 'athletics') : []);
    });
    return () => {
      alive = false;
    };
  }, [mounted]);

  // Admin-added events sit alongside the feed's. Deleted feed events stay
  // visible here, greyed out, so they can be restored.
  const serverEvents = (serverData?.events ?? []).filter((e) => e.category === 'athletics');
  const edited = applyAthleticsEdits([...serverEvents, ...(liveGames ?? [])], serverData, {
    includeHidden: true,
  });
  // "All" is newest first: the games that just happened are the ones being
  // corrected, so they sit at the top instead of a season away.
  const upcoming =
    range === 'upcoming'
      ? edited
          .filter((e) => (e.endDate ?? e.date) >= todayIso)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 40)
      : [...edited].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);

  return (
    <AdminGate title="Athletics">
      <section className="space-y-2">
        {adding ? (
          <AddEventForm onDone={() => setAdding(false)} />
        ) : (
          <Button className="w-full" onClick={() => setAdding(true)}>
            Add event
          </Button>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>{range === 'upcoming' ? 'Upcoming' : 'All events'}</SectionTitle>
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {liveGames === null ? (
          <Spinner label="Loading the live schedule…" />
        ) : upcoming.length === 0 ? (
          // An unreachable feed is a notice, not an empty state — they mean
          // different things and must not look the same.
          liveGames.length === 0 ? (
            <Card className="border-gold/40 bg-gold/10 p-3 text-xs text-[var(--muted)]">
              The live athletics schedule isn&rsquo;t reachable right now.
            </Card>
          ) : (
            <EmptyState title="No upcoming events" />
          )
        ) : (
          <Card className="divide-y divide-[var(--divider)]">
            {upcoming.map((e) => {
              const isEditing = editing === e.id;
              return (
                <div key={e.id} className={e.hidden ? 'opacity-60' : undefined}>
                  <div className="flex items-center">
                    <div className="min-w-0 flex-1">
                      <EventRow e={e} />
                    </div>
                    {e.hidden ? (
                      <Button
                        variant="outline"
                        size="sm" className="mr-4 shrink-0"
                        onClick={() => updateAthleticsEvent(e.id, { hidden: false })}
                      >
                        Restore
                      </Button>
                    ) : (
                      <button
                        onClick={() => setEditing(isEditing ? null : e.id)}
                        aria-label={`Edit ${e.title}`}
                        className="tap flex items-center justify-center pr-4 text-[var(--muted)] hover:text-brand"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  {isEditing && !e.hidden && <EventEditor e={e} onDone={() => setEditing(null)} />}
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </AdminGate>
  );
}
