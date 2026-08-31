'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { childScheduleLabel, gradeFromGradYear } from '@/lib/types';
import { currentSchoolYearStart, schoolYearLabel } from '@/lib/schoolYear';
import { openAeries } from '@/lib/links';
import { BrandMark } from '@/components/BrandMark';
import { Button, Card, SectionTitle } from '@/components/ui';
import {
  CalendarIcon,
  UtensilsIcon,
  MegaphoneIcon,
  TvIcon,
  PhoneIcon,
  UsersIcon,
  PinIcon,
  ShareIcon,
  SettingsIcon,
  ShieldIcon,
  GradIcon,
  ChevronRight,
  BellIcon,
  ClockIcon,
  MailIcon,
} from '@/components/icons';

function Row({
  href,
  Icon,
  label,
  sub,
}: {
  href: string;
  Icon: (p: { className?: string }) => JSX.Element;
  label: string;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className="tap flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-card bg-royal/10 text-royal dark:bg-white/5 dark:text-gold">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[var(--text)]">{label}</span>
        {sub && <span className="block text-xs text-[var(--muted)]">{sub}</span>}
      </span>
      <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
    </Link>
  );
}

export default function MorePage() {
  const mounted = useMounted();
  const profile = useAppStore((s) => s.profile);
  const staff = useAppStore((s) => s.userRole === 'staff');
  const parent = useAppStore((s) => s.userRole === 'parent');
  const parentChildren = useAppStore((s) => s.parentChildren);
  const activeChildId = useAppStore((s) => s.activeChildId);
  const activeChild = parentChildren.find((c) => c.id === activeChildId);
  const staffProfile = useAppStore((s) => s.staffProfile);
  const signOutStudent = useAppStore((s) => s.signOutStudent);
  const signOutStaff = useAppStore((s) => s.signOutStaff);
  const signOutParent = useAppStore((s) => s.signOutParent);
  const grade = gradeFromGradYear(profile.gradYear, currentSchoolYearStart());
  const signOut = staff ? signOutStaff : parent ? signOutParent : signOutStudent;

  return (
    // min-h-full + mt-auto pins Sign out to the bottom of the viewport on
    // short pages; on tall pages it simply follows the content.
    <div className="flex min-h-full flex-col">
      <div className="space-y-4">
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">More</h1>

      {/* Profile summary. Staff show who they signed in as (name + directory
          title); students show their name and class year. */}
      <Card className="flex items-center gap-3 p-4">
        <BrandMark size="md" showWordmark={false} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[var(--text)]">
            {!mounted
              ? ' '
              : staff
                ? staffProfile?.name || 'SMCHS Staff'
                : parent
                  ? 'SMCHS Parent'
                  : profile.name || 'SMCHS Eagle'}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {!mounted
              ? ' '
              : staff
                ? staffProfile?.title || 'Not signed in'
                : parent
                  ? parentChildren.length > 0
                    ? parentChildren.map((c, i) => c.name || `Child ${i + 1}`).join(', ')
                    : 'No children added'
                  : profile.gradYear
                    ? `Class of ${profile.gradYear}${grade ? ` · Grade ${grade} (${schoolYearLabel()})` : ''}`
                    : 'No class year set'}
          </div>
        </div>
        {staff ? (
          staffProfile && (
            <Link
              href={`/portal/${staffProfile.portal}/`}
              className="tap-expand text-xs font-semibold text-royal dark:text-gold"
            >
              Portal
            </Link>
          )
        ) : (
          <Link
            href={parent ? '/parent/' : '/more/settings/'}
            className="tap-expand text-xs font-semibold text-royal dark:text-gold"
          >
            Edit
          </Link>
        )}
      </Card>

      {/* Grades: prominent hand-off to Aeries. Students only. */}
      {!staff && (
        <button onClick={openAeries} className="tap w-full text-left">
          <Card className="flex items-center gap-3 p-4 transition-colors hover:border-royal">
            <span className="flex h-10 w-10 items-center justify-center rounded-card bg-royal text-white">
              <GradIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-[var(--text)]">Grades</span>
              <span className="block text-xs text-[var(--muted)]">Aeries website</span>
            </span>
            <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
          </Card>
        </button>
      )}

      <section>
        <SectionTitle className="mb-2">Your Day</SectionTitle>
        <Card className="divide-y divide-[var(--divider)] overflow-hidden">
          <Row
            href="/more/schedule/"
            Icon={ClockIcon}
            label={parent ? childScheduleLabel(activeChild?.name) : 'My Schedule'}
            sub={
              staff
                ? 'Add the classes you teach'
                : parent
                  ? "Add and rename your child's classes"
                  : 'Add and rename your classes'
            }
          />
          <Row href="/calendar/" Icon={CalendarIcon} label="Bell Schedule & Calendar" sub="Day types and events" />
          {!parent && (
            <Row href="/more/menu/" Icon={UtensilsIcon} label="Campus Dining" sub="Menu, hours, and prices" />
          )}
        </Card>
      </section>

      <section>
        <SectionTitle className="mb-2">School</SectionTitle>
        <Card className="divide-y divide-[var(--divider)] overflow-hidden">
          <Row href="/announcements/" Icon={MegaphoneIcon} label="Announcements" sub="Weekly & Teams" />
          <Row href="/more/clubs/" Icon={ShareIcon} label="Student Clubs" sub="Live club directory" />
          <Row href="/more/athletics/" Icon={BellIcon} label="Athletics" sub="Information and schedules" />
          <Row href="/more/map/" Icon={PinIcon} label="Campus Map" sub="Buildings and downloads" />
        </Card>
      </section>

      <section>
        <SectionTitle className="mb-2">Help</SectionTitle>
        <Card className="divide-y divide-[var(--divider)] overflow-hidden">
          <Row href="/more/contacts/" Icon={UsersIcon} label="Contacts" sub="Who to ask, with numbers and emails" />
          <Row href="/more/attendance/" Icon={PhoneIcon} label="Report an Absence" sub="Who to contact and how" />
          <Row href="/more/safety/" Icon={ShieldIcon} label="Safety & Security" sub="Security contact and anonymous tips" />
          <Row href="/more/support/" Icon={MailIcon} label="Open a Support Ticket" sub="Report an app problem, anonymously" />
        </Card>
      </section>

      <section>
        <SectionTitle className="mb-2">App</SectionTitle>
        <Card className="divide-y divide-[var(--divider)] overflow-hidden">
          {/* Parents get it too once a child is open: an imported schedule
              lands in that child's slot, which is how most parents fill one in. */}
          {!staff && (!parent || Boolean(activeChildId)) && (
            <Row
              href="/more/share/"
              Icon={ShareIcon}
              label={parent ? `Share ${childScheduleLabel(activeChild?.name)}` : 'Share My Schedule'}
              sub={parent ? 'Or import the one they shared with you' : 'Compare with a friend'}
            />
          )}
          <Row href="/more/settings/" Icon={SettingsIcon} label="Settings" sub="Theme, profile" />
          <Row href="/more/privacy/" Icon={ShieldIcon} label="Privacy" sub="What the app does with your data" />
        </Card>
      </section>

      {/* Admin tools live on the Admin tab (bottom nav) — no duplicate list here. */}

      {/* Sign out lives here, at the very bottom of More — not on Home. */}
      </div>
      <div className="mt-auto pt-5">
        <Button variant="outline" className="w-full text-[var(--muted)]" onClick={signOut}>
          Sign out
        </Button>
        {/* Maker's mark (user-requested). The logo art is white, so light mode inverts it. */}
        <div className="mt-3 text-center text-[11px] text-[var(--muted)] opacity-80">
          Created by Ben Patterson &amp; Marcus Chien &apos;27
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/crossgen-ai.png"
            alt=""
            aria-hidden="true"
            className="h-6 w-auto opacity-55 invert dark:opacity-45 dark:invert-0"
          />
          <span className="text-[11px] text-[var(--muted)] opacity-80">A CrossGen-AI Product</span>
        </div>
      </div>
    </div>
  );
}
