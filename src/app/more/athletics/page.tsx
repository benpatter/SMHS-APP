'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SchoolEvent } from '@/config/calendar';
import { effectiveSchool, useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { applyAthleticsEdits } from '@/lib/store';
import { fetchLiveEvents } from '@/lib/providers/live';
import { BackLink } from '@/components/BackLink';
import { PullToRefresh } from '@/components/PullToRefresh';
import { EventRow } from '@/components/AthleticsRows';
import { Card, EmptyState, LinkButton, SectionTitle } from '@/components/ui';
import { nowInSchoolTz } from '@/lib/time';

/** Real external services the school itself links from smhs.org/athletics. */
const TICKETS_URL = 'https://gofan.co/app/school/CA19032'; // GoFan, SMCHS school page
const LIVESTREAM_URL = 'https://www.smhs.org/athletics/livestream';

export default function AthleticsPage() {
  const mounted = useMounted();
  const todayIso = nowInSchoolTz().toFormat('yyyy-MM-dd');
  const admin = useAppStore((s) => s.admin);
  const serverData = useAppStore((s) => s.serverData);
  // Ticketing and streaming providers change; the admin override wins.
  const school = useAppStore((s) => effectiveSchool(s.serverData, s.admin));
  const ticketsUrl = (mounted && school.athleticsTicketsUrl) || TICKETS_URL;
  const livestreamUrl = (mounted && school.athleticsLivestreamUrl) || LIVESTREAM_URL;

  // Real games from the school's live calendar (athletics category).
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

  const syncServerData = useAppStore((s) => s.syncServerData);
  const refresh = useCallback(async () => {
    const [evts] = await Promise.all([fetchLiveEvents(), syncServerData()]);
    setLiveGames(evts ? evts.filter((e) => e.category === 'athletics') : []);
    return evts !== null;
  }, [syncServerData]);

  // Admin-added events (shared via the server) sit alongside the live feed's.
  const serverEvents = (serverData?.events ?? []).filter((e) => e.category === 'athletics');
  const live = applyAthleticsEdits([...serverEvents, ...(liveGames ?? [])], serverData)
    .filter((e) => (e.endDate ?? e.date) >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 40);


  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="space-y-4">
      <BackLink />
      <div className="flex items-center gap-3">
        {/* Eagle mark is allowed here: athletic/spirit context only. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/eagle-logo.svg" alt="SMCHS Eagles" width={40} height={40} />
        <div>
          <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Athletics</h1>
          <p className="text-sm text-[var(--muted)]">Go Eagles!</p>
        </div>
      </div>

      {liveGames !== null && liveGames.length === 0 && (
        <Card className="border-gold/40 bg-gold/10 p-3 text-xs text-[var(--muted)]">
          The live athletics schedule isn&apos;t reachable right now.
        </Card>
      )}

      {/* Game night, one tap: the same ticket/stream services smhs.org links to. */}
      <div className="grid grid-cols-2 gap-2.5">
        <LinkButton href={ticketsUrl} external variant="primary">
          Buy Tickets
        </LinkButton>
        <LinkButton href={livestreamUrl} external variant="gold">
          Watch Live
        </LinkButton>
      </div>

      <section className="space-y-2">
        <SectionTitle>Upcoming</SectionTitle>
        {live.length === 0 ? (
          <EmptyState title="No upcoming games">Check back as the season fills in.</EmptyState>
        ) : (
          <Card className="divide-y divide-[var(--divider)]">
            {live.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </Card>
        )}
      </section>
    </div>
    </PullToRefresh>
  );
}
