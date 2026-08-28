'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { refreshSession } from '@/lib/portalAuth';
import { initMetrics, trackScreen } from '@/lib/metrics';
import { fetchDining, fetchLiveSchedule } from '@/lib/providers/live';
import { SCHOOL } from '@/config/school';
import { setLiveLunchChart } from '@/config/buildings';
import { BrandMark } from './BrandMark';
import { BottomNav } from './BottomNav';
import { Onboarding } from './Onboarding';
import { AlertBanner } from './AlertBanner';
import { DemoBanner } from './DemoBanner';
import { PageNotices } from './PageNotices';
import { SupportNotices } from './SupportNotices';
import { Spinner } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const userRole = useAppStore((s) => s.userRole);
  const staffProfile = useAppStore((s) => s.staffProfile);
  const activeChildId = useAppStore((s) => s.activeChildId);
  const setLiveSchedule = useAppStore((s) => s.setLiveSchedule);
  const syncServerData = useAppStore((s) => s.syncServerData);
  const setStaffSessionExpired = useAppStore((s) => s.setStaffSessionExpired);
  const restoreStaffSession = useAppStore((s) => s.restoreStaffSession);

  // Until the local profile rehydrates, render the shell (instant) but hold the
  // onboarding decision so we never flash onboarding at a returning student.
  const ready = mounted && hydrated;

  // Pull the real per-date schedule once (the rotated bell schedule / day types),
  // and the live lunch-by-building chart so schedule personalization uses the
  // same source of truth the menu page displays.
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchLiveSchedule().then((days) => alive && days && setLiveSchedule(days));
    fetchDining().then((d) => alive && d && setLiveLunchChart(d.lunch));
    return () => {
      alive = false;
    };
  }, [mounted, setLiveSchedule]);

  // Anonymous usage reporting: the app-open + session clock start once, and
  // every navigation reports its screen. Events carry only this device's
  // random id and role — see src/lib/metrics.ts for the privacy model.
  useEffect(() => {
    if (mounted) initMetrics();
  }, [mounted]);
  useEffect(() => {
    if (mounted) trackScreen(pathname);
  }, [mounted, pathname]);

  // Server-owned content: cached copy instantly, then revalidate on boot, on
  // every page navigation (a 304 costs nothing when nothing changed), and on
  // staff sign-in (queued local edits get their first chance to push).
  useEffect(() => {
    if (mounted) syncServerData();
  }, [mounted, pathname, staffProfile, syncServerData]);

  // Keep idle devices current too: an admin's banner, schedule edit, or any
  // other shared change lands without a reload. Revalidate every ~30s while the
  // app is visible (ETag 304s make the no-change case free) and immediately
  // when the app returns to the foreground, where mobile suspends timers.
  // The interval is jittered per device so thousands of clients spread their
  // polls instead of hitting the server on the same beat.
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      syncServerData();
      fetchLiveSchedule().then((days) => alive && days && setLiveSchedule(days));
    };
    const id = setInterval(refresh, 30_000 + Math.floor(Math.random() * 15_000));
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [mounted, syncServerData, setLiveSchedule]);

  // Keep a signed-in staff member signed in — and put them back when the device
  // dropped the sign-in on its own.
  //
  // Two jobs, one call:
  //  1. RENEW. Checking the token slides its expiry server-side, so someone who
  //     keeps opening the app never runs out the clock.
  //  2. RESTORE. This is a home-screen PWA, so WebKit sweeps localStorage on its
  //     own schedule and takes the token and the saved profile with it — the
  //     app came back knowing nobody. The session also lives in an HttpOnly
  //     cookie, which that sweep can't touch, so the server can still say who
  //     this is and the sign-in comes back with no password and no prompt.
  //
  // Runs whether or not a profile survived — with no profile, restoring IS the
  // job. But only from a signed-out device (userRole null): on a device where
  // someone has since signed in as a student or parent, a stale staff cookie
  // must not quietly take it over.
  //
  // Throttled to once an hour, since this fires on every return to the
  // foreground and phones foreground constantly.
  useEffect(() => {
    if (!ready) return;
    if (!staffProfile && userRole !== null) return;
    let alive = true;
    let lastCheck = 0;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCheck < 60 * 60 * 1000) return;
      lastCheck = now;
      refreshSession().then((r) => {
        // 'offline' means the check couldn't be made. It says nothing about the
        // sign-in, so it must never end one.
        if (!alive || r.status === 'offline') return;
        if (r.status === 'expired') {
          setStaffSessionExpired(Boolean(staffProfile));
          return;
        }
        setStaffSessionExpired(false);
        if (r.identity && !staffProfile) restoreStaffSession(r.identity);
      });
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [ready, staffProfile, userRole, setStaffSessionExpired, restoreStaffSession]);

  // Nobody is redirected away from home at launch — not even signed-in staff.
  // A boot-to-portal redirect (tried 2026-08) made home unreachable: any
  // staff-flagged device opened on the portal instead of the app, which read
  // as a hijack, and an installed PWA relaunching on `/` hit it every single
  // open. Home is the app; staff reach their portal through the visible
  // entries on Home and More.

  // A choice on the welcome screen (student, parent, staff) records itself and
  // then navigates. The record alone would drop the overlay instantly and leave
  // home showing until the destination arrived, so the welcome screen is held
  // here — on a spinner — from the tap until the route it named is on screen.
  // The hold is local state on purpose: a reload clears it, and the recorded
  // choice (which persists) is what puts the device on the right screen.
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  useEffect(() => {
    if (!leavingTo) return;
    const trimmed = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
    if (trimmed(pathname) === trimmed(leavingTo)) {
      setLeavingTo(null);
      return;
    }
    // A navigation that never lands must not strand anyone on the spinner.
    const t = setTimeout(() => setLeavingTo(null), 2500);
    return () => clearTimeout(t);
  }, [leavingTo, pathname]);

  // The staff portals are a closed room: from the portal chooser and the
  // sign-in gates, the only way out is the screen's own "Go back". Hiding the
  // tab bar (and the header's home link) keeps someone who picked the staff
  // door from wandering into the student app without ever signing in. Signed-in
  // staff get the nav back — their Home tab is their portal.
  const portalLocked = pathname.startsWith('/portal') && !(mounted && staffProfile);

  // Parent devices boot to the parent hub until a child's page is opened.
  // While that redirect is in flight, `parentRedirecting` below holds the home
  // content so the dashboard never flashes before the hub paints.
  const parentRedirecting = ready && userRole === 'parent' && pathname === '/' && !activeChildId;
  useEffect(() => {
    if (parentRedirecting) router.replace('/parent/');
  }, [parentRedirecting, router]);

  return (
    // Exactly one viewport tall, never more: header and nav are fixed-size
    // rails and <main> is the only thing that scrolls, and only when its
    // content genuinely overflows. 100dvh (not 100vh) so mobile browser chrome
    // showing/hiding doesn't push the shell past the visible area.
    <div className="mx-auto flex h-[100dvh] max-w-screen-sm flex-col overflow-hidden">
      <header className="safe-top safe-x z-30 shrink-0 border-b border-[var(--divider)] bg-[var(--surface)]">
        <div className="flex h-14 items-center justify-center px-4">
          {portalLocked ? (
            <span className="flex items-center px-2 py-1.5">
              <BrandMark size="sm" />
            </span>
          ) : (
            <Link
              href="/"
              aria-label={`${SCHOOL.shortName} home`}
              className="tap flex items-center rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <BrandMark size="sm" />
            </Link>
          )}
        </div>
        <div className="h-0.5 bg-gold" />
        <AlertBanner />
        <DemoBanner />
      </header>

      {/* The app is fully local-first: page content is time- and device-state
          dependent, so we render it after mount to keep a single source of truth
          (the client) and avoid static-export hydration mismatches. The shell
          above paints instantly from cache either way. */}
      {/* min-h-0 is what lets a flex child actually shrink and scroll instead
          of growing the shell. overscroll-contain stops a scroll that reaches
          the end from chaining out to the document. */}
      <main className="safe-x min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
        {mounted && !parentRedirecting ? (
          <>
            <PageNotices />
            <SupportNotices />
            {children}
          </>
        ) : (
          <Spinner />
        )}
      </main>

      {!portalLocked && <BottomNav />}

      {/* The password-setup page is exempt from onboarding: it's reached from
          an emailed link, usually on a device that has never opened the app, and
          the "Who are you?" overlay would sit on top of the form and block the
          one thing the link exists to do. Anyone holding a setup link is staff —
          the page marks the device accordingly (see its chooseStaff call). */}
      {((ready && userRole === null && !pathname.startsWith('/portal/set-password')) ||
        leavingTo !== null) && (
        <Onboarding leaving={leavingTo !== null} onLeave={setLeavingTo} />
      )}
    </div>
  );
}
