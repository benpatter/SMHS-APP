'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellScheduleView } from '@/components/BellScheduleView';
import { PullToRefresh } from '@/components/PullToRefresh';
import { DayTypeStrip } from '@/components/DayTypeStrip';
import { DayStepper } from '@/components/DayStepper';
import { Card, EmptyState, Pill, SectionTitle, Spinner } from '@/components/ui';
import { useMounted, useNow } from '@/lib/hooks';
import { DateTime } from '@/lib/time';
import { allEvents, eventsFor, focusDay, upcomingEvents } from '@/lib/calendar';
import { fetchLiveEvents } from '@/lib/providers/live';
import { applyAthleticsEdits, useAppStore } from '@/lib/store';
import type { SchoolEvent } from '@/config/calendar';

function dedupeById(events: SchoolEvent[]): SchoolEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => (seen.has(e.id) ? false : seen.add(e.id)));
}

function occursOn(e: SchoolEvent, iso: string): boolean {
  return e.endDate ? iso >= e.date && iso <= e.endDate : e.date === iso;
}

const CATEGORY_TONE: Record<SchoolEvent['category'], 'royal' | 'gold' | 'muted'> = {
  academic: 'royal',
  athletics: 'gold',
  arts: 'gold',
  ministry: 'royal',
  'campus-life': 'gold',
  holiday: 'muted',
};

function EventBody({ e }: { e: SchoolEvent }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[var(--text)]">{e.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
          <Pill tone={CATEGORY_TONE[e.category]}>{e.category.replace('-', ' ')}</Pill>
          {e.time && <span>{e.time}</span>}
          {e.location && <span>· {e.location}</span>}
        </div>
      </div>
      {/* Game location, same badge the athletics page shows. Admin-set per
          event; no location, no badge. */}
      {e.venue && (
        <Pill tone="gold" className="shrink-0 uppercase">
          {e.venue}
        </Pill>
      )}
    </div>
  );
}

function EventRow({ e }: { e: SchoolEvent }) {
  return (
    <div className="px-4 py-3">
      <EventBody e={e} />
    </div>
  );
}

export default function CalendarPage() {
  const mounted = useMounted();
  const now = useNow(60_000);
  const today = now.startOf('day');
  // Subscribe to the admin overlay + live schedule so events/day-types reflect instantly.
  const admin = useAppStore((s) => s.admin);
  const serverData = useAppStore((s) => s.serverData);
  // Re-render the grid (no-school dimming) once the live schedule loads, and
  // when an admin day edit lands from the server.
  const liveScheduleLoaded = useAppStore((s) => s.liveScheduleLoaded);
  const live = useAppStore((s) => s.liveSchedule);

  /**
   * Which day the calendar opens on. Null means "whatever day matters right
   * now" — today during the school day, the next school day after 5pm — so an
   * evening visit lands on tomorrow without the student stepping to it. It also
   * keeps following that rule as the live calendar loads and as 5pm passes,
   * right up until the student picks a day themselves; from then on the
   * calendar stays exactly where they put it.
   */
  const [picked, setPicked] = useState<DateTime | null>(null);
  const focus = useMemo(
    () => focusDay(now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, live, liveScheduleLoaded, serverData],
  );
  const selected = picked ?? focus.date;
  /** Picking any day pins the calendar there and ends the auto-follow above. */
  const setSelected = setPicked;
  const iso = selected.toFormat('yyyy-MM-dd');

  // Real events from the school's Master Calendar (via the live proxy).
  // Three states, never one: loading, live, or unreachable — an empty list only
  // ever means "nothing scheduled".
  const [rawLiveEvents, setRawLiveEvents] = useState<SchoolEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'offline'>('loading');
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchLiveEvents()
      .then((evts) => {
        if (!alive) return;
        if (evts) {
          setRawLiveEvents(evts);
          setStatus('ok');
        } else setStatus('offline');
      })
      .catch(() => alive && setStatus('offline'));
    return () => {
      alive = false;
    };
  }, [mounted]);
  const syncServerData = useAppStore((s) => s.syncServerData);
  const refresh = useCallback(async () => {
    const [evts] = await Promise.all([fetchLiveEvents(), syncServerData()]);
    if (evts) {
      setRawLiveEvents(evts);
      setStatus('ok');
      return true;
    }
    setStatus('offline');
    return false;
  }, [syncServerData]);

  // Shared admin overrides (renamed games, new times, added events) apply here too.
  const liveEvents = useMemo(
    () => applyAthleticsEdits([...(serverData?.events ?? []), ...rawLiveEvents], serverData),
    [rawLiveEvents, serverData],
  );

  // Dates that have at least one event. Drives the dots in the month grid.
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    for (const e of [...allEvents(), ...liveEvents]) {
      if (e.endDate) {
        let d = DateTime.fromISO(e.date);
        const end = DateTime.fromISO(e.endDate);
        for (let i = 0; d <= end && i < 60; i++, d = d.plus({ days: 1 })) set.add(d.toFormat('yyyy-MM-dd'));
      } else {
        set.add(e.date);
      }
    }
    return set;
  }, [admin, liveEvents]);

  const dayEvents = useMemo(
    () => dedupeById([...eventsFor(iso), ...liveEvents.filter((e) => occursOn(e, iso))]),
    [iso, admin, liveEvents],
  );
  // "Upcoming" is anchored to the calendar's selected date, not the wall clock,
  // so stepping the calendar past an event's date drops it from the list.
  // Events that fall on the selected day are intentionally excluded here: they
  // belong to the "On This Day" section, so each event shows in exactly one place.
  const upcoming = useMemo(
    () =>
      dedupeById([
        ...upcomingEvents(iso, 60),
        ...liveEvents.filter((e) => (e.endDate ?? e.date) >= iso),
      ])
        .filter((e) => e.date > iso)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 40),
    [iso, admin, liveEvents],
  );
  // One entry per day: busy days (game day + a liturgy + a rehearsal) render as
  // a single date rail with the events stacked beside it, not repeated rows.
  const upcomingByDay = useMemo(() => {
    const groups: { date: string; events: SchoolEvent[] }[] = [];
    for (const e of upcoming) {
      const last = groups[groups.length - 1];
      if (last && last.date === e.date) last.events.push(e);
      else groups.push({ date: e.date, events: [e] });
    }
    return groups;
  }, [upcoming]);

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="space-y-4">
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Calendar</h1>

      {/* Selected day + fine day-stepping. Tap the date (or the calendar icon) to
          open the month picker. One calendar drives the day type + schedule. */}
      <DayStepper
        selected={selected}
        today={today}
        onSelect={setSelected}
        eventDates={eventDates}
      />

      <section className="space-y-2">
        <SectionTitle>Next Few Days</SectionTitle>
        <DayTypeStrip selected={selected} onSelect={(d) => setSelected(d.startOf('day'))} />
      </section>

      <section className="space-y-2">
        <SectionTitle>Bell Schedule</SectionTitle>
        <BellScheduleView date={selected} />
      </section>

      {dayEvents.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>On This Day</SectionTitle>
          <Card className="divide-y divide-[var(--divider)]">
            {dayEvents.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <SectionTitle>Upcoming Events</SectionTitle>
        {status === 'loading' ? (
          <Spinner label="Loading the calendar…" />
        ) : status === 'offline' ? (
          <Card className="border-gold/40 bg-gold/10 p-3 text-xs text-[var(--muted)]">
            The school&apos;s live calendar isn&apos;t reachable right now.
          </Card>
        ) : upcoming.length === 0 ? (
          <EmptyState title="No upcoming events">Check back as the calendar fills in.</EmptyState>
        ) : (
          <Card className="divide-y divide-[var(--divider)]">
            {upcomingByDay.map((g) => {
              const d = DateTime.fromISO(g.date);
              return (
                <button
                  key={g.date}
                  onClick={() => setSelected(d.startOf('day'))}
                  className="block w-full text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                        {d.toFormat('ccc')}
                      </div>
                      <div className="text-lg font-bold leading-none text-[var(--text)]">
                        {d.toFormat('d')}
                      </div>
                      <div className="text-[10px] uppercase text-[var(--muted)]">{d.toFormat('LLL')}</div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      {g.events.map((e) => (
                        <EventBody key={e.id} e={e} />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </Card>
        )}
      </section>
    </div>
    </PullToRefresh>
  );
}
