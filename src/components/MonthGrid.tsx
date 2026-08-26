'use client';

import { useEffect, useMemo, useState } from 'react';
import { DateTime } from '@/lib/time';
import { ChevronRight } from './icons';
import { Card, cx } from './ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Month-grid date picker. Tap any day to jump the calendar there; arrows page
 * whole months ahead/back. Highlights today + the selected day, and marks each
 * day of the month with what a student actually wants off a month view:
 *
 *   - a school day carries its day-type tag ("Reg", "Mass", "Min"),
 *   - a day with something on the calendar carries a blue dot beside it,
 *   - a day off carries nothing at all — the blank IS the information.
 *
 * Days from the neighbouring months are left unmarked; they're only there to
 * square off the grid.
 */
export function MonthGrid({
  selected,
  today,
  onSelect,
  eventDates,
  isSchoolDay,
  dayTag,
}: {
  selected: DateTime;
  today: DateTime;
  onSelect: (d: DateTime) => void;
  /** Days that get the blue dot. */
  eventDates: Set<string>;
  isSchoolDay: (d: DateTime) => boolean;
  /** Day-type tag for a school day. `abbr` is empty on a day off. */
  dayTag: (d: DateTime) => { abbr: string; label: string };
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
          const tag = inMonth ? dayTag(d) : { abbr: '', label: '' };
          const hasEvent = inMonth && eventDates.has(iso);
          return (
            <button
              key={iso}
              onClick={() => onSelect(d.startOf('day'))}
              aria-label={[
                d.toFormat('cccc, LLLL d'),
                tag.abbr && tag.label,
                hasEvent && 'has events',
              ]
                .filter(Boolean)
                .join(', ')}
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
              <span className="leading-none">{d.day}</span>
              {/* Marker row. Always present, even when empty, so every number in
                  the grid sits on the same line instead of hopping around. */}
              <span className="mt-1 flex h-2.5 max-w-full items-center gap-0.5 overflow-hidden leading-none">
                {/* On a tagged day the dot keeps its slot either way, so the
                    tags stay in one column down the week instead of sliding
                    sideways as events come and go. A day with only a dot
                    centers it under the number. */}
                {(hasEvent || tag.abbr) && (
                  <span
                    className={cx(
                      'h-1 w-1 shrink-0 rounded-full',
                      !hasEvent ? 'bg-transparent' : isSel ? 'bg-white' : 'bg-brand',
                    )}
                  />
                )}
                {tag.abbr && (
                  <span
                    className={cx(
                      'truncate text-[9px] font-semibold uppercase tracking-tight',
                      // Same small-gold pair the bell schedule uses: the deep
                      // gold holds contrast on white, the brand gold on dark.
                      isSel ? 'text-gold-soft' : 'text-gold-deep dark:text-gold',
                    )}
                  >
                    {tag.abbr}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
