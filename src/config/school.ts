/**
 * School-wide facts and config-driven contacts / external links.
 *
 * Everything a non-developer might need to correct lives here as plain data.
 * Values marked `confirmWithSchool` are sensible placeholders pending the
 * school's sign-off (see PROMPT.md "Before relying on placeholders").
 */

export const TIMEZONE = 'America/Los_Angeles';

export const SCHOOL = {
  name: 'Santa Margarita Catholic High School',
  shortName: 'SMCHS',
  // Two-line institutional wordmark for the header. Explicit (not derived from
  // `name`) so the line break never depends on a word-count heuristic.
  wordmark: ['Santa Margarita', 'Catholic High School'] as const,
  mascot: 'Eagles',
  city: 'Rancho Santa Margarita, CA',
  diocese: 'Diocese of Orange',
  website: 'https://www.smhs.org',
};

/**
 * Absence / attendance reporting. Parent-facing: tap-to-call. Phone only —
 * the school does not accept absence reports by email.
 * confirmWithSchool: exact line.
 */
export const ATTENDANCE = {
  phone: '+19497666020',
  phoneDisplay: '(949) 766-6020',
  procedure:
    'Report an absence before the start of the school day. A parent or guardian must call the Attendance Office with the student name, grade, reason, and expected duration. Send notes for prearranged absences ahead of time.',
  hours: 'Mon–Fri, 7:30 AM – 3:30 PM',
  confirmWithSchool: true,
};

/**
 * Grades are NOT rebuilt in-app. One tap hands off to Aeries.
 * iOS/Android attempt the Aeries Mobile Portal app first via its scheme, then
 * fall back to the web portal. confirmWithSchool: exact portal URL / scheme.
 */
export const AERIES = {
  // Aeries publishes NO way to deep-link into the Mobile Portal app on iOS
  // (verified 2026-08-12: no universal links or assetlinks on *.aeries.net,
  // no documented URL scheme, none registered anywhere public). Firing a
  // guessed scheme shows iOS's "Cannot Open Page" alert, so none is fired.
  // If the school gets the real scheme from Aeries support, set it here
  // ('theirscheme://') and iOS will try the app before the web portal.
  appScheme: null as string | null,
  // Play Store application id of Aeries Mobile Portal. Android's intent: URL
  // opens the installed app or follows the web fallback — the browser
  // decides, so a stale id degrades to the web portal, never an error.
  androidPackage: 'com.aeries.mobile.psp',
  // Web portal (the fallback everywhere, and the desktop answer).
  webPortal: 'https://aeries.smhs.org/student/LoginParent.aspx',
  confirmWithSchool: true,
};

/**
 * Microsoft Teams deep link (Campus Life announcements live in Teams).
 *
 * `appBase` is the scheme Teams registers on iOS and Android: a deep link is
 * the https URL with the scheme swapped, so `msteams://teams.microsoft.com/l/…`
 * opens the same channel the web URL does. `androidPackage` is the Play Store
 * application id, used to build the intent: URL that opens the app when it's
 * installed and falls back to the browser when it isn't.
 */
export const TEAMS = {
  appBase: 'msteams://',
  webBase: 'https://teams.microsoft.com',
  androidPackage: 'com.microsoft.teams',
};
