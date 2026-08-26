'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useNow } from '@/lib/hooks';
import { useAppStore } from '@/lib/store';
import { dayTypeStrip } from '@/lib/calendar';
import type { DateTime } from '@/lib/time';
import { cx } from './ui';

/** Days shown after the pinned Today chip. Five chips total, one row, no wrap. */
const AHEAD = 4;

/**
 * Glanceable "is tomorrow a block day?" strip, the question students ask most.
 * With `onSelect` the days become buttons (Calendar page selects the day);
 * without it each day links to the Calendar.
 *
 * TODAY IS PINNED to the first slot and always looks like today, so it is never
 * scrolled away and never has to be hunted for. The four slots beside it are a
 * WINDOW that walks forward: tapping a day re-anchors the window to it, so the
 * three days after it appear and the next tap walks on again. The window is
 * derived from `selected`, not held in state, so it also follows the day
 * stepper, the month picker and a tapped event without any of them getting out
 * of step with each other.
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

  const today = now.startOf('day');
  const todayIso = today.toFormat('yyyy-MM-dd');
  const selectedIso = selected?.toFormat('yyyy-MM-dd');
  // Anchor: the selected day when it's ahead of today (so its own week comes
  // into view), otherwise the usual "next few days" from tomorrow.
  const anchor = selected && selected.startOf('day') > today ? selected.startOf('day') : today.plus({ days: 1 });

  const days = useMemo(
    () => [...dayTypeStrip(today, 1), ...dayTypeStrip(anchor, AHEAD)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayIso, anchor.toMillis(), live, serverData],
  );

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {days.map(({ date, short, off }) => {
        const iso = date.toFormat('yyyy-MM-dd');
        const isToday = iso === todayIso;
        // One gold box, on the day being VIEWED. On the calendar page that's
        // the selected day (today drops to its own outline when it isn't the
        // one on screen); on the portal glance strips, with nothing selected,
        // it stays on today.
        const highlight = selectedIso ? iso === selectedIso : isToday;
        const cls = cx(
          'flex flex-col items-center rounded-card border px-1 py-2 text-center transition-colors',
          highlight
            ? 'border-gold bg-gold/15'
            : // Today keeps a standing mark of its own so the anchor of the whole
              // strip is obvious even while another day is being read.
              isToday
              ? 'border-royal bg-royal/5 dark:border-gold/60 dark:bg-white/5'
              : 'border-[var(--divider)] hover:border-royal',
        );
        const inner = (
          <>
            <span
              className={cx(
                'text-[10px] font-semibold uppercase tracking-wide',
                isToday ? 'text-royal dark:text-gold' : 'text-[var(--muted)]',
              )}
            >
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
