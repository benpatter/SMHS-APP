'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useNow } from '@/lib/hooks';
import { useAppStore } from '@/lib/store';
import { dayTypeStrip } from '@/lib/calendar';
import type { DateTime } from '@/lib/time';
import { cx } from './ui';

/**
 * Glanceable "is tomorrow a block day?" strip, the question students ask most.
 * With `onSelect` the days become buttons (Calendar page selects the day);
 * without it each day links to the Calendar.
 */
export function DayTypeStrip({
  onSelect,
  selected,
}: {
  onSelect?: (date: DateTime) => void;
  /** Day the calendar is viewing; the gold fill follows it instead of today. */
  selected?: DateTime;
}) {
  const now = useNow(60_000);
  // Subscribe to admin day edits + the live schedule so the
  // strip updates the instant any changes (otherwise it could lag up to a minute).
  const live = useAppStore((s) => s.liveSchedule);
  const serverData = useAppStore((s) => s.serverData);
  const days = useMemo(() => dayTypeStrip(now, 5), [now, live, serverData]);
  const todayIso = now.toFormat('yyyy-MM-dd');
  const selectedIso = selected?.toFormat('yyyy-MM-dd');

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {days.map(({ date, short, off }) => {
        const iso = date.toFormat('yyyy-MM-dd');
        const isToday = iso === todayIso;
        // One gold box, on the day being VIEWED. On the calendar page that's
        // the selected day (today drops to a plain outline when it isn't the
        // one on screen); on the portal glance strips, with nothing selected,
        // it stays on today.
        const highlight = selectedIso ? iso === selectedIso : isToday;
        const cls = cx(
          'flex flex-col items-center rounded-card border px-1 py-2 text-center transition-colors',
          highlight ? 'border-gold bg-gold/15' : 'border-[var(--divider)] hover:border-royal',
        );
        const inner = (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {isToday ? 'Today' : date.toFormat('ccc')}
            </span>
            <span className="text-sm font-bold text-[var(--text)]">{date.toFormat('d')}</span>
            <span
              className={cx(
                'mt-0.5 text-[10px] font-semibold leading-tight',
                off ? 'text-[var(--muted)]' : 'text-royal dark:text-gold',
              )}
            >
              {short}
            </span>
          </>
        );
        return onSelect ? (
          <button key={iso} onClick={() => onSelect(date)} className={cls}>
            {inner}
          </button>
        ) : (
          <Link key={iso} href="/calendar/" className={cls}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
