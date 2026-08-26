'use client';

import { useAppStore, useViewerGradYear } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import { computeState } from '@/lib/scheduleEngine';
import { focusDay, isSchoolDay, nextSchoolDay, scheduleFor } from '@/lib/calendar';
import { formatClock, formatCountdown, formatDayLabel, relativeDayName } from '@/lib/time';
import { gradeFromGradYear } from '@/lib/types';
import { currentSchoolYearStart } from '@/lib/schoolYear';
import { Pill } from './ui';
import { PinIcon } from './icons';

/** "a" or "an" for the day-type tag that follows it ("an ALL PERIODS day"). */
function article(short: string): string {
  return /^[aeiou]/i.test(short.trim()) ? 'an' : 'a';
}

/**
 * The hero. Answers "how much longer?" in one glance, from across a hallway.
 * Updates every second, fully offline, always correct for America/Los_Angeles.
 * Never blank: flips to a passing-period countdown between classes.
 */
export function Countdown() {
  const now = useNow(1000);
  const schedule = useAppStore((s) => s.schedule);
  // The viewer's class year: theirs, or the child a parent is looking at.
  const gradYear = useViewerGradYear();
  // Subscribe so the hero re-resolves the moment the live schedule loads,
  // an admin forces a day type, or an admin day edit lands from the server.
  useAppStore((s) => s.liveScheduleLoaded);
  useAppStore((s) => s.serverData);

  // Grade group picks the student's timeline on split-mass days (Jr/Sr vs Fr/So).
  const grade = gradeFromGradYear(gradYear, currentSchoolYearStart());
  const group = grade == null ? undefined : grade >= 11 ? 'jrsr' : 'frso';
  // Lunch is derived inside computeState from this day's 3rd-period building.
  const state = computeState({ now, personal: schedule, group, grade });
  const { status } = state;

  const countdown = formatCountdown(state.secondsRemaining);
  const room = (r?: string) => (r ? ` · ${r}` : '');

  // The ticking countdown is the small line; the big line names what's
  // happening right now ("Current Period: Biology" / "Passing Period").
  let big = '';
  let showBig = true;

  if (status === 'in-period' && state.current) {
    big = `Current: ${state.current.free ? 'Free Period' : state.current.displayName}`;
  } else if (status === 'passing' && state.nextPeriod) {
    big = 'Passing Period';
  } else if (status === 'before-school' && state.nextPeriod) {
    big = `School starts soon`;
  } else {
    showBig = false;
  }

  const next = nextSchoolDay(now);
  // After 5pm today's day type is spent, so the tag speaks for the day ahead
  // instead: "Tomorrow is a REGULAR day", or "Monday is an ALL PERIODS day" on a
  // Friday evening. Same focusDay rule the schedule card follows, so the two
  // never disagree. Falls back to today's plain tag when there's no school day
  // close enough to name (summer, a long break).
  const ahead = focusDay(now);
  const aheadShort =
    !ahead.isToday && isSchoolDay(ahead.date) ? scheduleFor(ahead.date).short : null;
  // School IS on, but every period today is limited to other grades (a retreat,
  // a grade-level testing day). Saying "No school today" there is simply wrong.
  const nothingForThisGrade = status === 'no-school' && isSchoolDay(now);

  return (
    <section
      className="relative overflow-hidden rounded-card bg-royal p-5 text-white shadow-sm"
      aria-live="polite"
      aria-label="Current period countdown"
    >
      {/* Day type, always visible without a tap. */}
      <div className="relative mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {aheadShort ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-white/70">
            {relativeDayName(ahead.date, now)} is {article(aheadShort)}
            <Pill tone="on-royal">{aheadShort}</Pill>
            day
          </span>
        ) : (
          <Pill tone="on-royal">{state.schedule.short}</Pill>
        )}
        <span className="text-xs font-medium text-white/70">{formatDayLabel(now)}</span>
      </div>

      {showBig ? (
        <div className="relative pr-28">
          {/* The SM mark fills the open right side, clear of the header row.
              The -royal variant's field is recolored to #1A4784 so it melts
              into the banner seamlessly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/sm-mark-royal.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-1/2 h-24 w-auto -translate-y-1/2"
          />
          <p className="tnum text-xl font-semibold text-white/85">{countdown}</p>
          <div className="my-1 font-bold leading-tight text-gold" style={{ fontSize: '2.25rem' }}>
            {big}
          </div>

          {status === 'in-period' && state.current && (
            <div className="flex items-center gap-2 text-white/90">
              {state.current.room && (
                <span className="inline-flex items-center gap-1 text-sm">
                  <PinIcon className="h-4 w-4 text-gold" />
                  {state.current.room}
                </span>
              )}
            </div>
          )}
          {status === 'before-school' && state.nextPeriod && (
            <p className="text-lg font-semibold">First: {state.nextPeriod.displayName}</p>
          )}

          {/* What's next. */}
          {state.nextClass && status !== 'before-school' && (
            <p className="mt-3 border-t border-white/15 pt-3 text-sm text-white/85">
              <span className="font-semibold text-gold">Up next:</span>{' '}
              {state.nextClass.displayName}
              {room(state.nextClass.room)} · starts {formatClock(state.nextClass.start)}
            </p>
          )}
          {status === 'before-school' && state.nextClass && (
            <p className="mt-3 border-t border-white/15 pt-3 text-sm text-white/85">
              {state.nextClass.displayName}
              {room(state.nextClass.room)} at {formatClock(state.nextClass.start)}
            </p>
          )}

        </div>
      ) : (
        // No-school / after-school: never blank, points to the next school day.
        // A big SM mark fills the center-right, inset enough to stay clear of
        // the date in the top-right corner.
        <div className="relative py-3 pr-32 sm:pr-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/sm-mark-royal.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 h-20 w-auto -translate-y-1/2 sm:right-20 sm:h-36"
          />
          <p className="text-2xl font-bold">
            {status === 'after-school'
              ? "School's out for today"
              : nothingForThisGrade
                ? 'Nothing scheduled for your grade'
                : 'No school today'}
          </p>
          <p className="mt-1 text-sm text-white/80">
            {status === 'after-school'
              ? 'Enjoy your afternoon, Eagle.'
              : nothingForThisGrade
                ? 'School is in session, but none of today\u2019s periods are for your class year.'
                : state.schedule.description}
          </p>
          {next && (
            <p className="mt-3 border-t border-white/15 pt-3 text-sm text-white/85">
              <span className="font-semibold text-gold">Next school day:</span>{' '}
              {formatDayLabel(next)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
