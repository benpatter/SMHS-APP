'use client';

import { useState } from 'react';
import { MonthGrid } from '@/components/MonthGrid';
import { Card } from '@/components/ui';
import { CalendarIcon, ChevronRight, XIcon } from '@/components/icons';
import { DateTime, formatDayLabel } from '@/lib/time';
import { dayAbbrFor, dayShortFor, isSchoolDay } from '@/lib/calendar';

/** What the month grid marks a day with: its day-type tag, plus the full short
 *  label behind it for screen readers. */
function dayTag(d: DateTime) {
  return { abbr: dayAbbrFor(d), label: dayShortFor(d) };
}

/**
 * Selected day + fine day-stepping, with the month picker behind the date.
 * Shared by the student calendar and the admin day-schedule editor — both drove
 * the exact same control, so it lives in one place.
 */
export function DayStepper({
  selected,
  today,
  onSelect,
  eventDates,
}: {
  selected: DateTime;
  today: DateTime;
  onSelect: (d: DateTime) => void;
  /** Days that get the blue dot in the month grid: days with events on the
   *  student calendar, days with a saved schedule in the admin editor. */
  eventDates: Set<string>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Card className="flex items-center justify-between px-2 py-2">
        <button
          onClick={() => onSelect(selected.minus({ days: 1 }))}
          aria-label="Previous day"
          className="tap flex items-center justify-center rounded-card px-2 text-[var(--muted)] hover:text-brand"
        >
          <ChevronRight className="h-5 w-5 rotate-180" />
        </button>
        <div className="flex flex-col items-center">
          <button
            onClick={() => setPickerOpen(true)}
            aria-label="Open month picker"
            className="tap flex items-center gap-1.5 font-semibold text-[var(--text)]"
          >
            <CalendarIcon className="h-4 w-4 text-royal dark:text-gold" />
            {formatDayLabel(selected)}
          </button>
          {!selected.hasSame(today, 'day') && (
            <button
              onClick={() => onSelect(today)}
              className="tap-expand text-xs font-semibold text-royal dark:text-gold"
            >
              Back to today
            </button>
          )}
        </div>
        <button
          onClick={() => onSelect(selected.plus({ days: 1 }))}
          aria-label="Next day"
          className="tap flex items-center justify-center rounded-card px-2 text-[var(--muted)] hover:text-brand"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </Card>

      {pickerOpen && (
        <div
          className="safe-top safe-bottom safe-x fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
          onClick={() => setPickerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Pick a date"
        >
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
                className="tap flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <MonthGrid
              selected={selected}
              today={today}
              onSelect={(d) => {
                onSelect(d);
                setPickerOpen(false);
              }}
              eventDates={eventDates}
              isSchoolDay={isSchoolDay}
              dayTag={dayTag}
            />
          </div>
        </div>
      )}
    </>
  );
}
