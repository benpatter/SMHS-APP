'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { Button, Card } from '@/components/ui';
import { ShieldIcon, BookIcon, ChevronRight } from '@/components/icons';

/**
 * The staff entry: nothing but the portal sign-ins. Everything else
 * (day glance, calendar, nav) lives INSIDE the portals, behind a sign-in.
 */
export default function PortalChooserPage() {
  const mounted = useMounted();
  const staffProfile = useAppStore((s) => s.staffProfile);
  const signOutStaff = useAppStore((s) => s.signOutStaff);

  return (
    <div className="space-y-4">
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">
        SM T.E.A.M. Member Portals
      </h1>

      <section>
        <p className="mb-2 text-sm text-[var(--muted)]">
          Sign in with your name from the school directory and your password.
        </p>

        <div className="space-y-2.5">
          <Link href="/portal/admin/">
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-royal">
              <span className="flex h-10 w-10 items-center justify-center rounded-card bg-royal text-white">
                <ShieldIcon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[var(--text)]">Admin portal</span>
                <span className="block text-xs text-[var(--muted)]">
                  Rector, Deans, Ed Tech, President&apos;s &amp; Principal&apos;s offices
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
            </Card>
          </Link>

          <Link href="/portal/teacher/">
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-royal">
              <span className="flex h-10 w-10 items-center justify-center rounded-card bg-royal text-white">
                <BookIcon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[var(--text)]">Faculty &amp; Staff Portal</span>
                <span className="block text-xs text-[var(--muted)]">Your schedule and Aeries</span>
              </span>
              <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
            </Card>
          </Link>
        </div>
      </section>

      {/* Signed-in staff sign out here; everyone else backs out to the welcome
          screen. Same full-width button as the student/parent home. */}
      <Button variant="outline" className="w-full text-[var(--muted)]" onClick={signOutStaff}>
        {mounted && staffProfile ? 'Sign out' : 'Go back'}
      </Button>
    </div>
  );
}
