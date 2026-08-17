'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { PortalGate } from '@/components/PortalGate';
import { BellScheduleView } from '@/components/BellScheduleView';
import { QuickActions } from '@/components/QuickActions';
import { Card, SectionTitle } from '@/components/ui';
import { ChevronRight, PlusIcon } from '@/components/icons';

/**
 * The Teacher portal home: the same glanceable day view, today's schedule, and
 * quick actions as the student home. Teachers add the classes they teach to
 * make the countdown and bell schedule personal (More → My Schedule).
 */
export default function TeacherPortalPage() {
  return (
    <PortalGate
      role="teacher"
      title="Teacher Portal"
      subtitle="Sign in from any department."
      dayGlance
    >
      <TeacherSchedule />
      <section>
        <SectionTitle className="mb-2">Quick Access</SectionTitle>
        <QuickActions />
      </section>
    </PortalGate>
  );
}

/** Mirrors the student home's schedule section, with a teacher-flavored nudge. */
function TeacherSchedule() {
  const mounted = useMounted();
  const schedule = useAppStore((s) => s.schedule);
  const hasClasses = mounted && Object.keys(schedule).length > 0;

  return (
    <>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Today&apos;s Schedule</SectionTitle>
          <Link
            href="/calendar/"
            className="tap-expand text-xs font-semibold text-royal dark:text-gold"
          >
            Full calendar →
          </Link>
        </div>
        <BellScheduleView compact />
      </section>

      {mounted && !hasClasses && (
        <Link href="/more/schedule/">
          <Card className="flex items-center gap-3 border-dashed p-4 transition-colors hover:border-royal">
            <span className="flex h-9 w-9 items-center justify-center rounded-card bg-gold/20 text-gold-deep dark:text-gold">
              <PlusIcon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-[var(--text)]">
                Add the classes you teach
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Makes your countdown personal.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </Card>
        </Link>
      )}
    </>
  );
}
