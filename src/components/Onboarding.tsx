'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { gradYearOptions, currentSchoolYearStart } from '@/lib/schoolYear';
import { gradeFromGradYear, isStudentEmail, STUDENT_EMAIL_DOMAIN } from '@/lib/types';
import { login } from '@/lib/portalAuth';
// ⚠ TEMPORARY import: passwordless test accounts skip the re-login password. Remove before launch.
import { PASSWORDLESS_TEST_EMAILS } from './PortalGate';
import { BrandMark } from './BrandMark';
import { GradIcon, ShieldIcon, UsersIcon, ChevronRight } from './icons';
import { Button, Card, Field, Spinner, TextInput, cx } from './ui';

type Step = 'who' | 'student-confirm' | 'student-form' | 'staff-confirm' | 'staff-password';

/**
 * First-launch welcome: "Who are you?" Student, Parent, or Staff.
 *
 * Students sign in with name + school email (must be @smhsstudents.org) + class
 * year; staff head to the staff portals; parents head to the parent hub
 * (/parent/) where they manage their children. Either way the choice persists,
 * so the app boots straight to the right home next time. If someone signed in
 * on this device before, their re-login is one tap ("Are you {name}?").
 */
export function Onboarding({
  leaving,
  onLeave,
}: {
  /** A destination is in flight: hold the screen instead of the question. */
  leaving: boolean;
  /** Tell the shell where this screen is headed, so it can hold it there. */
  onLeave: (path: string) => void;
}) {
  const router = useRouter();
  const signInStudent = useAppStore((s) => s.signInStudent);
  const signInStaff = useAppStore((s) => s.signInStaff);
  const chooseParent = useAppStore((s) => s.chooseParent);
  const chooseStaff = useAppStore((s) => s.chooseStaff);
  const rememberedStudent = useAppStore((s) => s.rememberedStudent);
  const rememberedStaff = useAppStore((s) => s.rememberedStaff);

  const [step, setStep] = useState<Step>('who');
  const years = gradYearOptions();
  const yearStart = currentSchoolYearStart();
  const [gradYear, setGradYear] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  // Staff re-login password step.
  const [password, setPassword] = useState('');
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState('');

  const emailOk = isStudentEmail(email);
  const canContinue = name.trim().length > 0 && emailOk && gradYear !== null;

  // Every choice here records itself and then LEAVES for another route. The
  // record has to land first — it's what makes the choice survive a reload —
  // but writing it also unmounts this overlay (AppShell shows it while the role
  // is null), which used to uncover home for the whole length of the
  // navigation. `onLeave` keeps the overlay up, on a spinner, until the
  // destination is actually on screen.
  const leave = (path: string, choose: () => void) => {
    choose();
    onLeave(path);
    router.replace(path);
  };

  const finishStudent = (n: string, e: string, y: number | null) => {
    leave('/', () => signInStudent(n, e, y));
  };

  const goStaffPortals = () => {
    leave('/portal/', chooseStaff);
  };

  const goParentHub = () => {
    leave('/parent/', chooseParent);
  };

  const finishStaff = () => {
    if (!rememberedStaff) return;
    const staff = rememberedStaff;
    leave(`/portal/${staff.portal}/`, () => signInStaff(staff));
  };

  // "Yes, that's me" still verifies the account's password. Remembering a
  // device never skips authentication. (Passwordless test accounts excepted.)
  const confirmStaff = () => {
    if (!rememberedStaff) return;
    if (PASSWORDLESS_TEST_EMAILS.includes(rememberedStaff.email)) {
      finishStaff();
      return;
    }
    setPassword('');
    setStaffError('');
    setStep('staff-password');
  };

  const submitStaffPassword = async () => {
    if (!rememberedStaff) return;
    setStaffBusy(true);
    setStaffError('');
    const r = await login(rememberedStaff.email, password);
    setStaffBusy(false);
    if (r.ok) finishStaff();
    else setStaffError(r.error ?? 'Login failed');
  };

  const whoStep = (
    <>
      <p className="mt-4 max-w-xs self-center text-center text-[var(--text)]">
        Welcome, Eagle. Who are you?
      </p>
      <div className="mt-5 space-y-3.5">
        <button
          className="tap w-full text-left"
          onClick={() => setStep(rememberedStudent ? 'student-confirm' : 'student-form')}
        >
          <Card className="flex items-center gap-3.5 px-4 py-6 transition-colors hover:border-royal">
            <span className="flex h-14 w-14 items-center justify-center rounded-card bg-royal text-white">
              <GradIcon className="h-8 w-8" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-bold text-[var(--text)]">Student</span>
              <span className="block text-sm text-[var(--muted)]">Use your school email</span>
            </span>
            <ChevronRight className="h-6 w-6 text-[var(--muted)]" />
          </Card>
        </button>

        <button className="tap w-full text-left" onClick={goParentHub}>
          <Card className="flex items-center gap-3.5 px-4 py-6 transition-colors hover:border-royal">
            <span className="flex h-14 w-14 items-center justify-center rounded-card bg-royal text-white">
              <UsersIcon className="h-8 w-8" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-bold text-[var(--text)]">Parent</span>
              <span className="block text-sm text-[var(--muted)]">Schedules & school info</span>
            </span>
            <ChevronRight className="h-6 w-6 text-[var(--muted)]" />
          </Card>
        </button>

        <button
          className="tap w-full text-left"
          onClick={() => {
            if (rememberedStaff) setStep('staff-confirm');
            else goStaffPortals();
          }}
        >
          <Card className="flex items-center gap-3.5 px-4 py-6 transition-colors hover:border-royal">
            <span className="flex h-14 w-14 items-center justify-center rounded-card bg-royal text-white">
              <ShieldIcon className="h-8 w-8" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-bold text-[var(--text)]">SMCHS T.E.A.M. Member</span>
              <span className="block text-sm text-[var(--muted)]">Admin, Faculty &amp; Staff</span>
            </span>
            <ChevronRight className="h-6 w-6 text-[var(--muted)]" />
          </Card>
        </button>
      </div>
    </>
  );

  const studentConfirmStep = rememberedStudent && (
    <Card className="mt-8 space-y-3 p-5 text-center">
      <p className="text-lg font-bold text-[var(--text)]">Are you {rememberedStudent.name}?</p>
      <p className="text-sm text-[var(--muted)]">
        {rememberedStudent.email}
        {rememberedStudent.gradYear ? ` · Class of ${rememberedStudent.gradYear}` : ''}
      </p>
      <Button
        className="w-full"
        onClick={() =>
          finishStudent(rememberedStudent.name, rememberedStudent.email, rememberedStudent.gradYear)
        }
      >
        Yes, that&apos;s me
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => setStep('student-form')}>
        No, I&apos;m someone else
      </Button>
      <button
        className="tap w-full text-xs font-semibold text-[var(--muted)] hover:text-brand dark:hover:text-gold"
        onClick={() => setStep('who')}
      >
        ← Back
      </button>
    </Card>
  );

  const staffConfirmStep = rememberedStaff && (
    <Card className="mt-8 space-y-3 p-5 text-center">
      <p className="text-lg font-bold text-[var(--text)]">Are you {rememberedStaff.name}?</p>
      <p className="text-sm text-[var(--muted)]">{rememberedStaff.title}</p>
      <Button className="w-full" onClick={confirmStaff}>
        Yes, that&apos;s me
      </Button>
      <Button variant="ghost" className="w-full" onClick={goStaffPortals}>
        No, I&apos;m someone else
      </Button>
      <button
        className="tap w-full text-xs font-semibold text-[var(--muted)] hover:text-brand dark:hover:text-gold"
        onClick={() => setStep('who')}
      >
        ← Back
      </button>
    </Card>
  );

  const staffPasswordStep = rememberedStaff && (
    <Card className="mt-8 space-y-3 p-5">
      <p className="text-sm text-[var(--muted)]">
        Signing in as{' '}
        <span className="font-semibold text-[var(--text)]">{rememberedStaff.name}</span>{' '}
        <span className="text-xs">({rememberedStaff.email})</span>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitStaffPassword();
        }}
        className="space-y-3"
      >
        <Field label="Password">
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setStaffError('');
            }}
            placeholder="••••••••"
            aria-invalid={Boolean(staffError)}
          />
        </Field>
        {staffError && <p className="text-sm text-danger">{staffError}</p>}
        <Button type="submit" className="w-full" disabled={!password || staffBusy}>
          {staffBusy ? 'Signing in…' : 'Log in'}
        </Button>
      </form>
      <button
        className="tap w-full text-xs font-semibold text-[var(--muted)] hover:text-brand dark:hover:text-gold"
        onClick={() => setStep('staff-confirm')}
      >
        ← Back
      </button>
    </Card>
  );

  const studentFormStep = (
    <>
      <Card className="mt-8 space-y-4 p-5">
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            autoComplete="given-name"
          />
        </Field>

        <Field label="School email">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder={`you${STUDENT_EMAIL_DOMAIN}`}
            autoComplete="email"
            inputMode="email"
            aria-invalid={emailTouched && email.length > 0 && !emailOk}
          />
          {emailTouched && email.length > 0 && !emailOk ? (
            <span className="mt-1 block text-xs text-danger">
              Students need their {STUDENT_EMAIL_DOMAIN} school email to get in.
            </span>
          ) : (
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Must end in {STUDENT_EMAIL_DOMAIN}.
            </span>
          )}
        </Field>

        <div>
          <span className="text-xs font-semibold text-[var(--muted)]">When do you graduate?</span>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {years.map((y) => {
              const g = gradeFromGradYear(y, yearStart);
              const selected = gradYear === y;
              return (
                <button
                  key={y}
                  onClick={() => setGradYear(y)}
                  className={cx(
                    'tap rounded-card border px-3 py-3 text-left transition-colors',
                    selected
                      ? 'border-gold bg-gold/15'
                      : 'border-[var(--divider)] hover:border-royal',
                  )}
                  aria-pressed={selected}
                >
                  <div className="text-lg font-bold text-[var(--text)]">Class of {y}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {g ? `Grade ${g}` : 'Alum / staff'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mt-6 space-y-2">
        <Button
          className="w-full"
          disabled={!canContinue}
          onClick={() => finishStudent(name, email, gradYear)}
        >
          Continue
        </Button>
        <Button variant="ghost" className="w-full text-[var(--muted)]" onClick={() => setStep('who')}>
          Back
        </Button>
      </div>
    </>
  );

  return (
    <div className="safe-top safe-bottom safe-x fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto flex min-h-full max-w-screen-sm flex-col px-5 py-6">
        {/* my-auto centers the block vertically when it's shorter than the
            screen, but (unlike justify-center) never clips taller steps. */}
        <div className="my-auto flex flex-col">
          <div className="flex flex-col items-center text-center">
            <BrandMark size="xl" showWordmark={false} />
            <h1 className="wordmark mt-3 text-2xl text-royal dark:text-[var(--text)]">SMCHS</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Santa Margarita Catholic High School
            </p>
          </div>

          {leaving ? (
            <div className="mt-8">
              <Spinner />
            </div>
          ) : (
            <>
              {step === 'who' && whoStep}
              {step === 'student-confirm' && studentConfirmStep}
              {step === 'staff-confirm' && staffConfirmStep}
              {step === 'staff-password' && staffPasswordStep}
              {step === 'student-form' && studentFormStep}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
