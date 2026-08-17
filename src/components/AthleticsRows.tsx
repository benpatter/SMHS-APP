'use client';

import type { SchoolEvent } from '@/config/calendar';
import { Pill } from '@/components/ui';
import { DateTime } from '@/lib/time';

export function DateChip({ d }: { d: DateTime }) {
  return (
    <div className="w-12 shrink-0 text-center">
      <div className="text-[10px] font-semibold uppercase text-[var(--muted)]">{d.toFormat('ccc')}</div>
      <div className="text-lg font-bold leading-none text-[var(--text)]">{d.toFormat('d')}</div>
      <div className="text-[10px] uppercase text-[var(--muted)]">{d.toFormat('LLL')}</div>
    </div>
  );
}

/** Real game from the school's live calendar (title already names the matchup). */
export function EventRow({ e }: { e: SchoolEvent }) {
  const d = DateTime.fromISO(e.date);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <DateChip d={d} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[var(--text)]">{e.title}</div>
        <div className="text-xs text-[var(--muted)]">
          {[e.time, e.location].filter(Boolean).join(' · ')}
        </div>
      </div>
      {/* Game location is admin-set per event; no location, no badge. */}
      {e.venue && <Pill tone="gold" className="uppercase">{e.venue}</Pill>}
    </div>
  );
}
