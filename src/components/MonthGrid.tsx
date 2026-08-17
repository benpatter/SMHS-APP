'use client';

import { useEffect, useMemo, useState } from 'react';
import { DateTime } from '@/lib/time';
import { ChevronRight } from './icons';
import { Card, cx } from './ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Month-grid date picker. Tap any day to jump the calendar there; arrows page
 * whole months ahead/back. Highlights today + the selected day, dims no-school
 * days, and dots days that have events.
 */
export function MonthGrid({
  selected,
  today,
  onSelect,
  eventDates,
  isSchoolDay,
}: {
  selected: DateTime;
  today: DateTime;
  onSelect: (d: DateTime) => void;
  eventDates: Set<string>;
  isSchoolDay: (d: DateTime) => boolean;
}) {
  const [viewMonth, setViewMonth] = useState<DateTime>(() => selected.startOf('month'));

  // Follow the selected date's month when it changes from elsewhere (e.g. an event tap).
  useEffect(() => {
    setViewMonth(selected.startOf('month'));
  }, [selected.year, selected.month]);

  const cells = useMemo(() => {
    const startOffset = viewMonth.weekday % 7; // grid is Sunday-first
    const start = viewMonth.minus({ days: startOffset });
    return Array.from({ length: 42 }, (_, i) => start.plus({ days: i }));
  }, [viewMonth]);

  const selIso = selected.toFormat('yyyy-MM-dd');
  const todayIso = today.toFormat('yyyy-MM-dd');

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setViewMonth((m) => m.minus({ months: 1 }))}
          aria-label="Previous month"
          className="tap flex h-8 w-8 items-center justify-center rounded-card text-[var(--muted)] hover:text-brand"
        >
          <ChevronRight className="h-5 w-5 rotate-180" />
        </button>
        <div className="font-semibold text-[var(--text)]">{viewMonth.toFormat('LLLL yyyy')}</div>
        <button
          onClick={() => setViewMonth((m) => m.plus({ months: 1 }))}
          aria-label="Next month"
          className="tap flex h-8 w-8 items-center justify-center rounded-card text-[var(--muted)] hover:text-brand"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {WEEKDAYS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const iso = d.toFormat('yyyy-MM-dd');
          const inMonth = d.month === viewMonth.month;
          const isToday = iso === todayIso;
          const isSel = iso === selIso;
          const off = inMonth && !isSchoolDay(d);
          const hasEvent = eventDates.has(iso);
          return (
            <button
              key={iso}
              onClick={() => onSelect(d.startOf('day'))}
              aria-label={d.toFormat('cccc, LLLL d')}
              aria-current={isSel ? 'date' : undefined}
              className={cx(
                'tap relative flex aspect-square flex-col items-center justify-center rounded-card text-sm transition-colors',
                isSel
                  ? 'bg-royal font-bold text-white'
                  : isToday
                    ? 'border border-gold font-bold text-[var(--text)]'
                    : 'hover:bg-black/5 dark:hover:bg-white/5',
                !isSel && !inMonth && 'text-[var(--muted)]/50',
                !isSel && inMonth && off && 'text-[var(--muted)]',
                !isSel && inMonth && !off && 'text-[var(--text)]',
              )}
            >
              {d.day}
              {hasEvent && (
                <span
                  className={cx(
                    'absolute bottom-1 h-1 w-1 rounded-full',
                    isSel ? 'bg-white' : 'bg-gold',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
