/** Outbound links: Aeries hand-off, Teams deep links, tap-to-call / tap-to-email. */
import { AERIES, TEAMS } from '@/config/school';
import { track } from './metrics';
import { effectiveSchool, useAppStore } from './store';

type Platform = 'ios' | 'android' | 'other';

function platform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as "Macintosh"; the touch points are what give it
  // away. Without this an iPad gets the desktop path and never opens the app.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

/**
 * An Android `intent:` URL: open the app if it's installed, otherwise follow
 * `browser_fallback_url`. The browser does the deciding, so there's no timer to
 * race and no error page when the app is missing — which is why Android gets
 * this rather than the scheme-plus-guess dance iOS needs.
 */
function intentUrl(web: string, androidPackage: string): string {
  const u = new URL(web);
  // The intent's own `#Intent;…` fragment occupies the hash, so any fragment on
  // the target URL can only ride along in the fallback.
  const target = `${u.host}${u.pathname}${u.search}`;
  return (
    `intent://${target}#Intent;scheme=${u.protocol.replace(':', '')};` +
    `package=${androidPackage};` +
    `S.browser_fallback_url=${encodeURIComponent(web)};end`
  );
}

/**
 * Hand off to a native app, falling back to the web when it isn't installed.
 *
 * Returns false when the caller should just let a normal link happen instead —
 * on a desktop browser there is no app to hand off to, and hijacking the click
 * would only cost the user their new tab.
 */
function openInApp({
  web,
  iosUrl,
  androidPackage,
}: {
  /** Where this goes on the web. Always the fallback, and the desktop answer. */
  web: string;
  /** Custom-scheme URL that opens the app on iOS. */
  iosUrl: string;
  /** Android application id, for the intent: URL. */
  androidPackage?: string;
}): boolean {
  if (typeof window === 'undefined') return false;
  const p = platform();
  if (p === 'other') return false;

  if (p === 'android' && androidPackage) {
    window.location.href = intentUrl(web, androidPackage);
    return true;
  }

  // iOS has no equivalent of intent:, so: fire the scheme, and if we're still
  // here a moment later, nothing handled it — go to the web.
  //
  // "Still here" is measured by the page going AWAY — visibilitychange to
  // hidden, or pagehide — and deliberately not by `blur`. When the scheme has
  // no handler, iOS puts up a "Cannot Open Page" alert, and that alert blurs
  // the page without hiding it. Treating blur as success would cancel the
  // fallback in exactly the case the fallback exists for, leaving a tap that
  // shows an error and then does nothing.
  let done = false;
  const finish = () => {
    if (done) return true;
    done = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onLeave);
    window.removeEventListener('pagehide', onLeave);
    return true;
  };
  const onLeave = () => {
    if (document.visibilityState === 'visible') return;
    finish();
  };
  const timer = window.setTimeout(() => {
    if (done) return;
    finish();
    window.location.href = web;
  }, 1500);

  document.addEventListener('visibilitychange', onLeave);
  window.addEventListener('pagehide', onLeave);

  try {
    window.location.href = iosUrl;
  } catch {
    finish();
    window.location.href = web;
  }
  return true;
}

/**
 * Grades = one tap to Aeries. We never rebuild grades in-app.
 *
 * Android: a launcher intent opens the Aeries Mobile Portal app when it's
 * installed; the browser follows the fallback URL when it isn't. No timer,
 * no error page — the browser does the deciding.
 *
 * iOS and desktop: the web portal in the DEFAULT browser. Aeries exposes no
 * deep link into its iOS app (no universal links, no documented scheme —
 * verified 2026-08-12), and guessed schemes only show "Cannot Open Page"
 * alerts, so none are fired — user decision 2026-08-12: when the app can't
 * be opened, open the browser. From the installed home-screen app that
 * means REAL Safari via Apple's x-safari-https:// scheme (iOS 17+), not the
 * PWA's in-app web view — Safari is where students may already be signed
 * in. Pre-17 devices fall back to the in-place portal after the scheme
 * goes unhandled. If Aeries ever provides a real scheme, set
 * AERIES.appScheme and iOS will try the app first.
 */
export function openAeries(): void {
  if (typeof window === 'undefined') return;
  track('feature', 'grades');
  const s = useAppStore.getState();
  const web = effectiveSchool(s.serverData, s.admin).aeriesWebPortal || AERIES.webPortal;
  const p = platform();
  if (p === 'android') {
    // No data URI on purpose: the app doesn't handle the portal's https URLs
    // (no app links published), so a plain launcher intent is what resolves.
    window.location.href =
      'intent:#Intent;action=android.intent.action.MAIN;' +
      'category=android.intent.category.LAUNCHER;' +
      `package=${AERIES.androidPackage};` +
      `S.browser_fallback_url=${encodeURIComponent(web)};end`;
    return;
  }
  if (p === 'ios') {
    if (AERIES.appScheme && openInApp({ web, iosUrl: AERIES.appScheme })) return;
    const standalone =
      (navigator as { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches;
    // openInApp's leave-detection handles the pre-17 case: the scheme goes
    // unhandled, nothing hides the page, and the timer opens the portal in
    // place instead.
    if (standalone && /^https?:\/\//.test(web) && openInApp({ web, iosUrl: web.replace(/^http(s?):\/\//, 'x-safari-http$1://') })) {
      return;
    }
    // A plain Safari tab IS the default browser already.
    window.location.href = web;
    return;
  }
  window.location.href = web;
}

/** The web URL for a Campus Life channel (or the Teams home when unspecified). */
export function teamsChannelUrl(explicit?: string): string {
  return explicit ?? TEAMS.webBase;
}

/**
 * Campus Life lives in Microsoft Teams, so opening it should land in the Teams
 * APP on a phone — a browser tab means signing in again and gets you a worse
 * version of a client the student already has installed.
 *
 * Teams registers the `msteams:` scheme on both platforms, and its deep links
 * are the https URL with the scheme swapped, so one conversion covers the
 * channel links and the plain home URL alike.
 *
 * Returns false on desktop, where the caller's ordinary link is the better
 * answer (Teams on the web is a real client there, and the tab is expected).
 */
export function openTeams(explicit?: string): boolean {
  const web = teamsChannelUrl(explicit);
  const handled = openInApp({
    web,
    iosUrl: web.replace(/^https?:\/\//, TEAMS.appBase),
    androidPackage: TEAMS.androidPackage,
  });
  if (handled) track('feature', 'teams');
  return handled;
}

// Turning a written number or address into a tel:/mailto: URI is the linkify
// module's job — it has to do the same for the ones it finds inside prose.
// Re-exported here so the existing call sites keep their import.
export { telHref, mailtoHref } from './linkify';
