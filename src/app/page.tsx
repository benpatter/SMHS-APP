'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Countdown } from '@/components/Countdown';
import { NotificationsPrompt } from '@/components/NotificationsPrompt';
import { PullToRefresh } from '@/components/PullToRefresh';
import { QuickActions } from '@/components/QuickActions';
import { BellScheduleView } from '@/components/BellScheduleView';
import { SectionTitle, Card, Segmented, cx } from '@/components/ui';
import { ChevronRight, PlusIcon, ShieldIcon, BookIcon } from '@/components/icons';
import { useAppStore } from '@/lib/store';
import { useMounted, useNow } from '@/lib/hooks';
import { focusDay } from '@/lib/calendar';

export default function HomePage() {
  const mounted = useMounted();
  const now = useNow(60_000);
  const schedule = useAppStore((s) => s.schedule);
  // Parents get the simplified home (no Campus Dining tile).
  const parent = useAppStore((s) => s.userRole === 'parent') && mounted;
  const staff = useAppStore((s) => s.userRole === 'staff') && mounted;
  const staffProfile = useAppStore((s) => s.staffProfile);
  const parentChildren = useAppStore((s) => s.parentChildren);
  const activeChildId = useAppStore((s) => s.activeChildId);
  const selectParentChild = useAppStore((s) => s.selectParentChild);
  const hasClasses = mounted && Object.keys(schedule).length > 0;
  // Re-resolve the focus day when the live calendar or an admin edit lands: at
  // 5pm it looks ahead to the next school day, and which day that is depends on
  // data that may still be loading.
  const live = useAppStore((s) => s.liveSchedule);
  const serverData = useAppStore((s) => s.serverData);
  // Today until 5pm, then the next school day. The card and its heading move
  // together, so the schedule on screen always matches the day being named.
  const focus = useMemo(() => focusDay(now), [now, live, serverData]);
  // Multi-child parents switch children right here instead of going back to
  // the hub. Single-child parents keep the plain "Go back" button.
  const showChildToggle = parent && parentChildren.length > 1;

  // The wrapper + flex-1 schedule section make Home fill the viewport exactly:
  // on light days the schedule card stretches to absorb the slack, so there's
  // never dead space above the nav. Pulling down from the top resyncs the
  // live schedule (rate-limited inside PullToRefresh).
  return (
    <PullToRefresh>
      <div className="flex flex-1 flex-col gap-3">
      {showChildToggle && (
        <Segmented
          label="Switch child"
          value={activeChildId ?? ''}
          onChange={selectParentChild}
          itemClassName="min-w-0 flex-1 truncate"
          options={parentChildren.map((c, i) => ({
            value: c.id,
            label: c.name || `Child ${i + 1}`,
          }))}
        />
      )}

      {/* Signed-in staff open on home like everyone else; their portal is one
          tap away instead of a forced redirect. */}
      {staff && staffProfile && (
        <Link href={`/portal/${staffProfile.portal}/`}>
          <Card className="flex items-center gap-3 p-4 transition-colors hover:border-royal">
            <span className="flex h-9 w-9 items-center justify-center rounded-card bg-royal text-white">
              {staffProfile.portal === 'admin' ? (
                <ShieldIcon className="h-5 w-5" />
              ) : (
                <BookIcon className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--text)]">
                {staffProfile.portal === 'admin' ? 'Admin Portal' : 'Faculty Portal'}
              </span>
              <span className="block truncate text-xs text-[var(--muted)]">
                {staffProfile.name}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </Card>
        </Link>
      )}

      <Countdown />

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between">
          {/* Which day it is lives on the card itself, in gold, so the heading
              never has to contradict it. */}
          <SectionTitle>{focus.isToday ? "Today's Schedule" : 'Schedule'}</SectionTitle>
          <Link
            href="/calendar/"
            className={cx('tap-expand text-xs font-semibold text-royal dark:text-gold')}
          >
            Full calendar →
          </Link>
        </div>
        {/* No date for today: BellScheduleView then highlights the period in
            progress. On an evening it renders the day ahead instead. */}
        <BellScheduleView compact className="flex-1" date={focus.isToday ? undefined : focus.date} />
      </section>

      {/* Optional, non-blocking nudge to personalize. Shown only when empty,
          and never to staff — their schedule lives in the portal. */}
      {mounted && !hasClasses && !staff && (
        <Link href="/more/schedule/">
          <Card className="flex items-center gap-3 border-dashed p-4 transition-colors hover:border-royal">
            <span className="flex h-9 w-9 items-center justify-center rounded-card bg-gold/20 text-gold-deep dark:text-gold">
              <PlusIcon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-[var(--text)]">
                Add your classes
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Makes your countdown personal.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </Card>
        </Link>
      )}

      {/* One-time ask; disappears forever once answered or dismissed. */}
      <NotificationsPrompt />

      <section>
        <SectionTitle className="mb-2">Quick Access</SectionTitle>
        <QuickActions parent={parent} />
      </section>

      </div>
    </PullToRefresh>
  );
}
