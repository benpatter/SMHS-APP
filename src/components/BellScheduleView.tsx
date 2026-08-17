'use client';

import Link from 'next/link';
import { Fragment, useMemo } from 'react';
import { useAppStore, useViewerGradYear } from '@/lib/store';
import { useNow } from '@/lib/hooks';
import {
  buildPeriodsToday,
  lunchInfoForDay,
  splitLunchLayout,
  splitMassLayout,
} from '@/lib/scheduleEngine';
import type { PeriodView } from '@/lib/scheduleEngine';
import { scheduleFor } from '@/lib/calendar';
import { gradesLabel } from '@/config/bellSchedules';
import { lunchLabel } from '@/config/buildings';
import { gradeFromGradYear } from '@/lib/types';
import { currentSchoolYearStart } from '@/lib/schoolYear';
import { formatClock } from '@/lib/time';
import { DateTime } from '@/lib/time';
import { Card, Pill, cx } from './ui';

/**
 * The full day's bell schedule, personalized and honoring the period-8 toggle.
 * Highlights the period in progress when showing today.
 *
 * On a two-lunch day with no building set yet, the lunch-divergent middle is
 * rendered as two parallel columns, first vs. second lunch, so the student
 * sees both options at once; the shared periods above and below stay full-width.
 * Split-mass days render the same way, but the columns are the grade groups
 * (Jr/Sr vs Fr/So) whose Mass/Period order differs.
 */
export function BellScheduleView({
  date,
  compact = false,
  className,
}: {
  date?: DateTime;
  compact?: boolean;
  className?: string;
}) {
  const liveNow = useNow(30_000);
  const now = date ?? liveNow;
  const schedule = useAppStore((s) => s.schedule);
  // The viewer's class year: theirs, or the child a parent is looking at.
  const gradYear = useViewerGradYear();
  // Re-resolve when an admin override, admin day edit, or the live schedule changes.
  const live = useAppStore((s) => s.liveSchedule);
  const serverData = useAppStore((s) => s.serverData);
  const isToday = (date ?? liveNow).hasSame(liveNow, 'day');

  const sched = useMemo(() => scheduleFor(now), [now, live, serverData]);
  // Grade level + group from the profile pick the student's timeline: the group
  // picks their split-mass column, the grade drops grade-limited periods that
  // aren't theirs. Null when no class year is set — then everything shows, badged.
  const grade = useMemo(() => gradeFromGradYear(gradYear, currentSchoolYearStart()), [gradYear]);
  const group = grade == null ? null : grade >= 11 ? 'jrsr' : 'frso';
  // Lunch is derived from the building of this day's 3rd class period; a null
  // track (no building set) shows both lunches so the student sees every option.
  const lunchInfo = useMemo(() => lunchInfoForDay(sched, schedule, grade), [sched, schedule, grade]);
  const periods = useMemo(
    () => buildPeriodsToday(sched, now.toFormat('yyyy-MM-dd'), schedule, lunchInfo.track, group, grade),
    [sched, now, schedule, lunchInfo.track, group, grade],
  );

  // Both lunches showing (dual day, no track resolved) → split-column layout.
  const split = useMemo(
    () => (lunchInfo.dual && !lunchInfo.track ? splitLunchLayout(periods) : null),
    [lunchInfo.dual, lunchInfo.track, periods],
  );
  // Split-mass day with no class year set → show both grade columns. When a class
  // year IS set, `periods` is already filtered to the student's grade, so it
  // falls through to the flat list (their single timeline).
  const mass = useMemo(() => (group ? null : splitMassLayout(periods)), [group, periods]);

  const isLive = (p: PeriodView) => isToday && liveNow >= p.start && liveNow < p.end;

  if (periods.length === 0) {
    return (
      <Card
        className={cx(
          'flex flex-col items-center justify-center p-5 text-center text-sm text-[var(--muted)]',
          className,
        )}
      >
        <p className="font-semibold text-[var(--text)]">{sched.name}</p>
        <p className="mt-1">{sched.description}</p>
      </Card>
    );
  }

  return (
    <Card className={cx('divide-y divide-[var(--divider)] overflow-hidden', className)}>
      <div className="flex items-center justify-between bg-royal/5 px-4 py-2.5 dark:bg-white/5">
        <span className="font-semibold text-[var(--text)]">{sched.name}</span>
        <Pill tone="royal">{sched.short}</Pill>
      </div>
      {/* Only when the student genuinely has two options. If their grade leaves
          them one lunch, `split` is null and asking them to set a building to
          "see which lunch is yours" sends them after a choice they don't have. */}
      {lunchInfo.dual &&
        (lunchInfo.track || split) &&
        (lunchInfo.track ? (
          <div className="flex items-center gap-3 bg-gold/10 px-4 py-3">
            <span className="text-sm text-[var(--muted)]">Today&apos;s lunch</span>
            <Pill tone="gold">{lunchLabel(lunchInfo.track)}</Pill>
            {lunchInfo.by === 'grade' && (
              <span className="text-xs text-[var(--muted)]">by class year today</span>
            )}
          </div>
        ) : (
          // Point at whichever input is actually missing: on a grade-decided day
          // the building is irrelevant, and vice versa.
          <Link
            href={lunchInfo.by === 'grade' ? '/more/settings/' : '/more/schedule/'}
            className="flex items-center gap-3 bg-black/[0.03] px-4 py-3 transition-colors hover:bg-black/[0.05] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <Pill tone="muted">Two lunches</Pill>
            <span className="min-w-0 flex-1 text-xs text-[var(--muted)]">
              {lunchInfo.by === 'grade'
                ? 'Lunch goes by class year today — set yours to see which is yours →'
                : `Set your Period ${lunchInfo.decidingPeriod} building to see which lunch is yours →`}
            </span>
          </Link>
        ))}
      {split ? (
        <SplitLayout
          pre={split.pre}
          post={split.post}
          headers={['1st Lunch', '2nd Lunch']}
          rows={split.rows.map((r) => ({ left: r.first, right: r.second }))}
          isLive={isLive}
          compact={compact}
        />
      ) : mass ? (
        <SplitLayout
          pre={mass.pre}
          post={mass.post}
          headers={['Jr/Sr', 'Fr/So']}
          rows={mass.rows.map((r) => ({ left: r.jrsr, right: r.frso }))}
          isLive={isLive}
          compact={compact}
        />
      ) : (
        periods.map((p) => <PeriodRow key={p.period.id} p={p} live={isLive(p)} compact={compact} />)
      )}
    </Card>
  );
}

/** Label for a period's kind, or null when the title already says it (class/special). */
function kindLabel(p: PeriodView): string | null {
  const k = p.period.kind;
  return k === 'lunch' ? 'Lunch' : k === 'break' ? 'Break' : null;
}

/** Display name matching My Schedule: "Block N · Class" for named classes. */
function periodName(p: PeriodView): string {
  return p.period.kind === 'class' && !p.free && p.displayName !== p.period.label
    ? `${p.period.label} · ${p.displayName}`
    : p.displayName;
}

/** Secondary meta line (kind · grades · building room · teacher · note), or null if empty. */
function metaLine(p: PeriodView): string | null {
  const parts = [
    kindLabel(p),
    p.period.grades ? `${gradesLabel(p.period.grades)} only` : null,
    [p.building, p.room].filter(Boolean).join(' '),
    p.teacher,
    p.note,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** One full-width period row. Compact (Home) keeps every row to a single line
    so a full day fits one viewport; the room still shows, details live in the
    Calendar view. */
function PeriodRow({ p, live, compact = false }: { p: PeriodView; live: boolean; compact?: boolean }) {
  const meta = metaLine(p);
  if (compact) {
    const where = [p.building, p.room].filter(Boolean).join(' ');
    return (
      <div
        className={cx(
          'flex items-center gap-3 px-4 py-2',
          live && 'bg-gold/15',
          p.period.kind !== 'class' && 'bg-black/[0.02] dark:bg-white/[0.02]',
        )}
      >
        <div className="tnum w-24 shrink-0 whitespace-nowrap text-xs text-[var(--muted)]">
          {p.start.toFormat('h:mm')} – {p.end.toFormat('h:mm')}
        </div>
        <span
          className={cx(
            'min-w-0 flex-1 truncate text-sm font-semibold',
            p.free ? 'text-[var(--muted)]' : 'text-[var(--text)]',
          )}
        >
          {periodName(p)}
        </span>
        {where && <span className="shrink-0 text-xs text-[var(--muted)]">{where}</span>}
        {live && <Pill tone="gold">Now</Pill>}
      </div>
    );
  }
  return (
    <div
      className={cx(
        'flex items-center gap-3 px-4 py-3',
        live && 'bg-gold/15',
        p.period.kind !== 'class' && 'bg-black/[0.02] dark:bg-white/[0.02]',
      )}
    >
      <div className="tnum w-24 shrink-0 text-xs text-[var(--muted)]">
        {formatClock(p.start)}
        <br />
        {formatClock(p.end)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cx('truncate font-semibold', p.free ? 'text-[var(--muted)]' : 'text-[var(--text)]')}
          >
            {periodName(p)}
          </span>
          {live && <Pill tone="gold">Now</Pill>}
        </div>
        {meta && <div className="truncate text-xs text-[var(--muted)]">{meta}</div>}
      </div>
    </div>
  );
}

/**
 * A divergent stretch of the day rendered as two parallel columns: the shared
 * `pre`/`post` periods stay full-width, and `rows` pair the two columns' cells by
 * time. Used for both the lunch split (1st/2nd Lunch) and the split-mass grade
 * split (Jr/Sr vs Fr/So).
 */
function SplitLayout({
  pre,
  post,
  headers,
  rows,
  isLive,
  compact = false,
}: {
  pre: PeriodView[];
  post: PeriodView[];
  headers: [string, string];
  rows: { left?: PeriodView; right?: PeriodView }[];
  isLive: (p: PeriodView) => boolean;
  compact?: boolean;
}) {
  return (
    <>
      {pre.map((p) => (
        <PeriodRow key={p.period.id} p={p} live={isLive(p)} compact={compact} />
      ))}
      <div className="bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="grid grid-cols-2 divide-x divide-[var(--divider)] border-b border-[var(--divider)]">
          {headers.map((h) => (
            <div
              key={h}
              className="px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"
            >
              {h}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 divide-x divide-[var(--divider)]">
          {rows.map((row, i) => (
            <Fragment key={i}>
              <SplitCell p={row.left} live={!!row.left && isLive(row.left)} first={i === 0} />
              <SplitCell p={row.right} live={!!row.right && isLive(row.right)} first={i === 0} />
            </Fragment>
          ))}
        </div>
      </div>
      {post.map((p) => (
        <PeriodRow key={p.period.id} p={p} live={isLive(p)} compact={compact} />
      ))}
    </>
  );
}

/** One cell inside the lunch-split grid. */
function SplitCell({ p, live, first }: { p?: PeriodView; live: boolean; first: boolean }) {
  if (!p) return <div className={cx(!first && 'border-t border-[var(--divider)]')} />;
  const meta = metaLine(p);
  return (
    <div className={cx('px-4 py-3', live && 'bg-gold/15', !first && 'border-t border-[var(--divider)]')}>
      {/* The Now pill rides with the time, not the name: these columns are half
          width, and sharing a line made "Second Lunch" wrap beside the pill. */}
      <div className="flex items-center justify-between gap-2">
        <span className="tnum text-xs text-[var(--muted)]">
          {formatClock(p.start)} – {formatClock(p.end)}
        </span>
        {live && <Pill tone="gold">Now</Pill>}
      </div>
      <div
        className={cx('mt-0.5 font-semibold', p.free ? 'text-[var(--muted)]' : 'text-[var(--text)]')}
      >
        {periodName(p)}
      </div>
      {meta && <div className="text-xs text-[var(--muted)]">{meta}</div>}
    </div>
  );
}
