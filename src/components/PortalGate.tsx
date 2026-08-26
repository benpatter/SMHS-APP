'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { useStaffDirectory, type StaffMember } from '@/lib/providers/staff';
import { login, requestPasswordSetup } from '@/lib/portalAuth';
import { StaffPicker } from './StaffPicker';
import { Countdown } from './Countdown';
import { DayTypeStrip } from './DayTypeStrip';
import { Button, Card, Field, SectionTitle, Spinner, TextInput } from './ui';

/**
 * Departments whose members may use the ADMIN portal. Everyone else in the
 * directory uses the Teacher portal.
 */
/**
 * Who may sign in to the Admin portal. The SERVER enforces the same lists in
 * server/index.mjs (ADMIN_DEPARTMENTS / ADMIN_TITLE_PATTERNS) before accepting any
 * write to shared app data — keep the two in step, and change them together.
 */
export const ADMIN_DEPARTMENTS = [
  "Dean's Office",
  'Educational Technology',
  "President's Office",
  "Principal's Office",
];

/**
 * Directory TITLES that carry Admin portal access on their own: the school's
 * Administration Board. Their directory departments sit all over campus (Campus
 * Ministry, Activities, Student Services, Options Program), so the office list
 * above can never find them — the TITLE is what makes someone an administrator,
 * and reading it from the live directory means a new Assistant Principal is an
 * admin the day the school publishes them, with no release and no list of names
 * to maintain.
 *
 * Matched against each comma-separated SEGMENT of the title, so "Assistant
 * Principal for Mission & Ministry, Director of Campus Ministry" qualifies on
 * its first segment. Anchored on purpose: "Principal" qualifies, "Administrative
 * Assistant to the Principal" does not.
 */
export const ADMIN_TITLE_PATTERNS: RegExp[] = [
  /^president$/,
  /^vice president$/,
  // The CFO's directory title is "Vice President of Finance"; the spelled-out
  // and initialled forms are here so a retitling doesn't silently drop access.
  /^vice president (of|for) [a-z& ]*finance$/,
  /^cfo$/,
  /^rector$/,
  /^principal$/,
  // Every Assistant Principal, whatever follows ("- Innovation", "of Student
  // Services", "for Mission & Ministry").
  /^assistant principal\b/,
];

/** Does any segment of this directory title carry Admin portal access? */
export function hasAdminTitle(title: string | undefined): boolean {
  return (title ?? '')
    .split(',')
    .some((segment) => {
      const t = segment.trim().replace(/\s+/g, ' ').toLowerCase();
      return ADMIN_TITLE_PATTERNS.some((re) => re.test(t));
    });
}

/**
 * May this directory entry use the Admin portal? `granted` is the hand-granted
 * email set from useAdminGrants() — admins added from the app's Admins page on
 * top of the department/title rules.
 */
export function isAdminEligible(s: StaffMember, granted?: ReadonlySet<string>): boolean {
  if (s.departments.some((d) => ADMIN_DEPARTMENTS.includes(d))) return true;
  if (granted && s.email && granted.has(s.email)) return true;
  return hasAdminTitle(s.title);
}

// ─── ⚠ TEMPORARY TEST ACCOUNTS: DELETE THIS BLOCK BEFORE LAUNCH ⚠ ──────────
// Off unless NEXT_PUBLIC_TEST_ACCOUNTS=1 at BUILD time (Next inlines it), so a
// production build ships no test identities and no password bypass at all.
const TEST_ACCOUNTS_ENABLED = process.env.NEXT_PUBLIC_TEST_ACCOUNTS === '1';
// One passwordless test identity PER portal: each shows up only in its own
// portal's picker (type "test") and skips the password step entirely. Testing
// only. The literals live INSIDE the enabled branch so a production build
// dead-code-eliminates them entirely: no test emails in the shipped bundle.
const TEST_ACCOUNTS: Record<'admin' | 'teacher', StaffMember> | null = TEST_ACCOUNTS_ENABLED
  ? {
      admin: {
        name: 'Admin test',
        title: 'Temporary test account · remove before launch',
        email: 'admin-test@smhs.org',
        departments: [],
      },
      teacher: {
        name: 'Teacher test',
        title: 'Temporary test account · remove before launch',
        email: 'teacher-test@smhs.org',
        departments: [],
      },
    }
  : null;
/** For the welcome screen's staff re-login: these skip the password prompt. */
export const PASSWORDLESS_TEST_EMAILS = TEST_ACCOUNTS
  ? Object.values(TEST_ACCOUNTS).map((a) => a.email)
  : [];
// Real-password test account: goes through the FULL create-password/email flow
// (no bypass). Admin portal only. Its email is also allowlisted on the server
// (server/index.mjs TEST_ACCOUNT_EMAILS, gated the same way).
const MARCUS_TEST_ACCOUNT: StaffMember | null = TEST_ACCOUNTS_ENABLED
  ? {
      name: 'Marcus Admin Test',
      title: 'Temporary test account · remove before launch',
      email: 'marcus.chien@crossgen-ai.com',
      departments: [],
    }
  : null;
// ─────────────────────────────────────────────────────────────────────────────

type Step = 'identity' | 'password';

/**
 * The at-a-glance day view (today card + next few days) staff see at the top
 * of every portal, only AFTER signing in. Each portal adds its own quick
 * access below this.
 */
function DayGlance() {
  return (
    <>
      <Countdown />
      <section>
        <SectionTitle className="mb-2">Next Few Days</SectionTitle>
        <DayTypeStrip />
      </section>
    </>
  );
}

/**
 * Gates a portal page behind "who are you + password".
 *
 * Step 1 (identity): pick yourself from the staff directory (department
 * dropdown + name typeahead). The Admin portal restricts the pool to
 * ADMIN_DEPARTMENTS; the Teacher portal offers every department.
 *
 * Step 2 (password): log in, or (first time) "Create password" to have the
 * server email a one-time setup link. On a server without SMTP the link comes back
 * to this client and is shown inline, clearly labeled as demo mode.
 */
export function PortalGate({
  role,
  title,
  subtitle,
  restrictDepartments,
  staffFilter,
  departmentOptions,
  excludeDepartments,
  dayGlance = false,
  children,
}: {
  role: 'admin' | 'teacher';
  title: string;
  subtitle: string;
  /** Show the day-glance blurb when signed in (portal HOME pages only). */
  dayGlance?: boolean;
  /** Only members of these departments may sign in; also becomes the dropdown. */
  restrictDepartments?: string[];
  /** Extra eligibility predicate on top of any department restriction. */
  staffFilter?: (s: StaffMember) => boolean;
  /** Explicit dropdown list (when eligibility isn't department-based). */
  departmentOptions?: string[];
  /** Hide these departments from the dropdown (the pool is set by staffFilter). */
  excludeDepartments?: string[];
  children: ReactNode;
}) {
  const mounted = useMounted();
  const portalUser = useAppStore((s) => s.portalUser);
  const staffProfile = useAppStore((s) => s.staffProfile);
  const rememberedStaff = useAppStore((s) => s.rememberedStaff);
  const sessionExpired = useAppStore((s) => s.staffSessionExpired);
  const signInStaff = useAppStore((s) => s.signInStaff);

  const { directory, loading } = useStaffDirectory();
  const [step, setStep] = useState<Step>('identity');
  const [member, setMember] = useState<StaffMember | null>(null);
  /**
   * Re-entering a password from INSIDE the portal, after the server said this
   * device's session lapsed. The local sign-in is kept either way — this is a
   * repair, not a sign-out, so cancelling puts them straight back.
   */
  const [reauth, setReauth] = useState(false);

  // Password step state.
  const [password, setPasswordInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setupState, setSetupState] = useState<{ emailed: boolean; setupUrl?: string } | null>(null);

  // The eligible picker pool + department dropdown for this portal.
  const pool = useMemo(() => {
    if (!directory) return { staff: [], departments: [] as string[] };
    let staff = directory.staff;
    let departments = restrictDepartments ?? departmentOptions ?? directory.departments;
    if (restrictDepartments) {
      staff = staff.filter((s) => s.departments.some((d) => restrictDepartments.includes(d)));
    }
    if (staffFilter) staff = staff.filter(staffFilter);
    // With an eligibility filter and no explicit dropdown, the departments come
    // from the people who survived it. A fixed office list would have offered
    // four departments while half the eligible admins (Campus Ministry, Student
    // Services, Activities…) sat outside all of them, so picking any department
    // hid the person looking for themselves.
    if (staffFilter && !restrictDepartments && !departmentOptions) {
      departments = [...new Set(staff.flatMap((s) => s.departments))].sort((a, b) =>
        a.localeCompare(b),
      );
    }
    if (excludeDepartments) departments = departments.filter((d) => !excludeDepartments.includes(d));
    // ⚠ TEMPORARY: each portal offers ONLY its own test account; the admin
    // portal also offers the real-password email-flow tester. Remove before launch.
    if (TEST_ACCOUNTS && MARCUS_TEST_ACCOUNT) {
      staff =
        role === 'admin'
          ? [...staff, TEST_ACCOUNTS.admin, MARCUS_TEST_ACCOUNT]
          : [...staff, TEST_ACCOUNTS[role]];
    }
    return { staff, departments };
  }, [directory, restrictDepartments, staffFilter, departmentOptions, excludeDepartments, role]);

  /** Who to re-authenticate as, straight from the live sign-in on this device. */
  const reauthMember: StaffMember | null =
    portalUser && staffProfile
      ? {
          name: staffProfile.name,
          email: staffProfile.email,
          title: staffProfile.title,
          departments: [],
        }
      : null;

  // Landing on the gate when we already know who this is: skip the department
  // dropdown and the 219-name typeahead and open on the password. Anyone else
  // taps "Not {name}? Go back" for the full picker. Passwordless test accounts
  // are excluded — they have no password to type.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !mounted || portalUser?.role === role) return;
    prefilled.current = true;
    const rs = rememberedStaff;
    if (!rs?.email || rs.portal !== role) return;
    if (PASSWORDLESS_TEST_EMAILS.includes(rs.email)) return;
    setMember({ name: rs.name, email: rs.email, title: rs.title, departments: [] });
    setStep('password');
  }, [mounted, portalUser, role, rememberedStaff]);

  if (!mounted) return <Spinner />;

  // Signed in with the right role → show the portal.
  if (portalUser?.role === role && !reauth) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Signed in as <span className="font-semibold text-[var(--text)]">{portalUser.name}</span>
          </p>
        </div>
        {/* The server stopped recognizing this device's session. That costs the
            ability to publish, and nothing else — the portal stays open, and
            one password puts it right. Being thrown back to a name picker over
            this was the "the app logged me out" complaint.

            Admin portal only: publishing is what a live session buys, and the
            teacher portal doesn't publish, so the same card there would be a
            red warning about a capability they never had. */}
        {sessionExpired && role === 'admin' && (
          <Card className="space-y-2 border-danger/40 p-3 text-sm">
            <p className="font-semibold text-danger">Your staff sign-in needs renewing.</p>
            <p className="text-xs text-[var(--muted)]">
              You&apos;re still signed in here, but changes won&apos;t reach other devices until
              you enter your password again.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setMember(reauthMember);
                setPasswordInput('');
                setError('');
                setSetupState(null);
                setStep('password');
                setReauth(true);
              }}
            >
              Enter password
            </Button>
          </Card>
        )}
        {dayGlance && <DayGlance />}
        {children}
        {/* No sign out here — it lives at the bottom of More, same as students. */}
      </div>
    );
  }

  const identityStep = (
    <Card className="space-y-3 p-4">
      {loading ? (
        <Spinner label="Loading the staff directory…" />
      ) : !directory ? (
        <p className="text-sm text-[var(--muted)]">
          We couldn&apos;t load the staff directory. Check your connection and try again.
        </p>
      ) : (
        <>
          <StaffPicker
            staff={pool.staff}
            departments={pool.departments}
            label="Your name"
            placeholder="Start typing your name…"
            selected={member}
            onSelect={setMember}
          />
          <Button
            className="w-full"
            disabled={!member || !member.email}
            onClick={() => {
              // ⚠ TEMPORARY: this portal's test account skips the password step.
              if (TEST_ACCOUNTS && member && member.email === TEST_ACCOUNTS[role].email) {
                signInStaff({ name: member.name, email: member.email, title: member.title, portal: role });
                return;
              }
              setError('');
              setSetupState(null);
              setPasswordInput('');
              setStep('password');
            }}
          >
            Continue
          </Button>
          {member && !member.email && (
            <p className="text-xs text-danger">
              The directory has no email for {member.name}, so this account can&apos;t sign in.
            </p>
          )}
        </>
      )}
    </Card>
  );

  const submitLogin = async () => {
    if (!member) return;
    setBusy(true);
    setError('');
    const r = await login(member.email, password);
    setBusy(false);
    if (r.ok) {
      signInStaff({ name: member.name, email: member.email, title: member.title, portal: role });
      setReauth(false); // repaired: back into the portal
    } else setError(r.error ?? 'Login failed');
  };

  const startSetup = async () => {
    if (!member) return;
    setBusy(true);
    setError('');
    const r = await requestPasswordSetup(member.email);
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Could not start password setup');
    else setSetupState({ emailed: Boolean(r.emailed), setupUrl: r.setupUrl });
  };

  const passwordStep = member && (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-[var(--muted)]">
        Signing in as <span className="font-semibold text-[var(--text)]">{member.name}</span>{' '}
        <span className="text-xs">({member.email})</span>
      </p>

      {setupState ? (
        setupState.emailed ? (
          <p className="rounded-card bg-gold/10 px-3 py-2.5 text-sm text-[var(--text)]">
            Check your email. A link to create your password was sent to{' '}
            <span className="font-semibold">{member.email}</span>. It expires in 1 hour.
          </p>
        ) : (
          <div className="space-y-2 rounded-card bg-gold/10 px-3 py-2.5 text-sm text-[var(--text)]">
            <p>
              This server can&apos;t send email yet, so use the setup link below (demo mode):
            </p>
            <a
              href={setupState.setupUrl}
              className="block break-all font-semibold text-royal underline dark:text-gold"
            >
              {setupState.setupUrl}
            </a>
          </div>
        )
      ) : (
        // Both paths are always offered. The server deliberately never reveals
        // whether an account has a password yet (that would let anyone map the
        // public roster to live accounts), so the client can't branch on it:
        // returning staff type their password, first-timers use the setup
        // button below — which doubles as "forgot password".
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitLogin();
            }}
            className="space-y-3"
          >
            <Field label="Password">
              <TextInput
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setError('');
                }}
                placeholder="••••••••"
                aria-invalid={Boolean(error)}
              />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={!password || busy}>
              {busy ? 'Signing in…' : 'Log in'}
            </Button>
          </form>
          <p className="text-sm text-[var(--muted)]">
            First time here, or forgot your password? We&apos;ll email a setup link to{' '}
            <span className="font-semibold text-[var(--text)]">{member.email}</span>.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void startSetup()}
            disabled={busy}
          >
            {busy ? 'Sending…' : 'Email me a setup link'}
          </Button>
        </div>
      )}

      <Button
        variant="ghost"
        className="w-full"
        onClick={() => (reauth ? setReauth(false) : setStep('identity'))}
      >
        {reauth ? 'Not now' : `Not ${member.name.split(' ')[0]}? Go back`}
      </Button>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
      </div>
      {/* `passwordStep` needs a member to name. Without one it renders nothing,
          which on the re-auth path would be a blank screen with no way out —
          so fall back to the picker rather than to a dead end. */}
      {step === 'identity' || !member ? identityStep : passwordStep}
      {(step === 'identity' || !member) && (
        <Link href="/portal/" className="block">
          <Button variant="outline" className="w-full text-[var(--muted)]">
            Back to staff portals
          </Button>
        </Link>
      )}
    </div>
  );
}
