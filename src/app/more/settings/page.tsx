'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import {
  disablePush,
  enablePush,
  getPushSubscription,
  insecureContext,
  needsHomeScreenInstall,
  pushPermission,
  pushSupported,
} from '@/lib/push';
import { useTheme, type ThemePref } from '@/lib/theme';
import { gradYearOptions, currentSchoolYearStart, schoolYearLabel } from '@/lib/schoolYear';
import { gradeFromGradYear, isStudentEmail, STUDENT_EMAIL_DOMAIN } from '@/lib/types';
import { nowInSchoolTz, atTime, DateTime } from '@/lib/time';
import { BackLink } from '@/components/BackLink';
import { Button, Card, Field, LinkButton, TextInput, cx } from '@/components/ui';
import { SunIcon, MoonIcon, SettingsIcon } from '@/components/icons';

function DemoTimeTravel() {
  const mounted = useMounted();
  const offset = useAppStore((s) => s.clockOffsetMs);
  const setClockOffsetMs = useAppStore((s) => s.setClockOffsetMs);
  const now = nowInSchoolTz();
  const [date, setDate] = useState(() => now.toFormat('yyyy-MM-dd'));
  const [time, setTime] = useState(() => now.toFormat('HH:mm'));

  const active = mounted && offset !== 0;

  return (
    <section className="space-y-2">
      <h2 className="section-title">Demo: view as date &amp; time</h2>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              const target = atTime(date, time);
              if (target.isValid) setClockOffsetMs(target.toMillis() - DateTime.now().toMillis());
            }}
          >
            View as this date &amp; time
          </Button>
          {active && (
            <Button variant="ghost" onClick={() => setClockOffsetMs(0)}>
              Use real time
            </Button>
          )}
        </div>
        <p className="text-xs text-[var(--muted)]">
          Sets the whole app to another moment (Home countdown, day type, bell schedule, calendar)
          and ticks from there. {active ? 'Demo mode is on.' : 'For demos.'}
        </p>
      </Card>
    </section>
  );
}

function NotificationsSection() {
  const mounted = useMounted();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    setPerm(pushPermission());
    void getPushSubscription().then((s) => setEnabled(Boolean(s)));
  }, [mounted]);

  if (!mounted) return null;

  const toggle = async () => {
    setBusy(true);
    if (enabled) {
      await disablePush();
      setEnabled(false);
    } else {
      const r = await enablePush();
      setEnabled(r === 'enabled');
      setPerm(pushPermission());
    }
    setBusy(false);
  };

  return (
    <section className="space-y-2">
      <h2 className="section-title">Notifications</h2>
      <Card className="p-4">
        {!pushSupported() ? (
          <p className="text-sm text-[var(--text)]">
            {insecureContext()
              ? 'Notifications only work over the app’s secure address. Open the app at its https link and turn alerts on there.'
              : needsHomeScreenInstall()
                ? 'Notifications need the app on your Home Screen. In Safari, tap Share, then "Add to Home Screen", and turn alerts on here afterward.'
                : 'This browser does not support notifications.'}
          </p>
        ) : perm === 'denied' ? (
          <p className="text-sm text-[var(--text)]">
            Notifications are blocked for this app. Allow them in your device settings to get
            schedule alerts.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--text)]">
                Schedule alerts
              </span>
              <span className="block text-xs text-[var(--muted)]">
                A notification when a day&apos;s bell schedule changes.
              </span>
            </span>
            <Button
              variant={enabled ? 'outline' : 'primary'}
              size="sm"
              disabled={busy || enabled === null}
              onClick={() => void toggle()}
            >
              {enabled === null ? '…' : enabled ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}

export default function SettingsPage() {
  const mounted = useMounted();
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const resetAll = useAppStore((s) => s.resetAll);
  const [theme, setTheme] = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);
  // Email edits stage locally and only commit once they're a valid student
  // address, so a half-typed (or wrong-domain) email never overwrites a good one.
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const emailValue = emailDraft ?? (mounted ? profile.email : '');
  const emailInvalid = emailValue.trim().length > 0 && !isStudentEmail(emailValue);

  const years = gradYearOptions();
  const yearStart = currentSchoolYearStart();

  const themeOptions: { id: ThemePref; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
    { id: 'light', label: 'Light', Icon: SunIcon },
    { id: 'dark', label: 'Dark', Icon: MoonIcon },
    { id: 'system', label: 'System', Icon: SettingsIcon },
  ];

  return (
    <div className="space-y-4">
      <BackLink />
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Settings</h1>

      {/* Profile */}
      <section className="space-y-2">
        <h2 className="section-title">Profile</h2>
        <Card className="space-y-3 p-4">
          <Field label="Name">
            <TextInput
              value={mounted ? profile.name : ''}
              onChange={(e) => setProfile({ name: e.target.value })}
              placeholder="First name"
            />
          </Field>
          <Field label="School email">
            <TextInput
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailValue}
              onChange={(e) => {
                const v = e.target.value;
                setEmailDraft(v);
                if (isStudentEmail(v)) setProfile({ email: v.trim() });
              }}
              placeholder={`you${STUDENT_EMAIL_DOMAIN}`}
              aria-invalid={emailInvalid}
            />
            {emailInvalid && (
              <span className="mt-1 block text-xs text-danger">
                Must be your {STUDENT_EMAIL_DOMAIN} school email. Other domains aren&apos;t saved.
              </span>
            )}
          </Field>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">
                Class year{mounted ? ` · grades for ${schoolYearLabel()}` : ''}
              </span>
              {mounted && profile.gradYear != null && (
                <button
                  onClick={() => setProfile({ gradYear: null })}
                  className="tap text-xs font-semibold text-royal hover:underline dark:text-gold"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {years.map((y) => {
                const selected = mounted && profile.gradYear === y;
                const g = gradeFromGradYear(y, yearStart);
                return (
                  <button
                    key={y}
                    onClick={() => setProfile({ gradYear: y })}
                    className={cx(
                      'tap rounded-card border px-1 py-2 text-center transition-colors',
                      selected ? 'border-gold bg-gold/15' : 'border-[var(--divider)] hover:border-royal',
                    )}
                  >
                    <div className="text-sm font-bold text-[var(--text)]">{y}</div>
                    <div className="text-[10px] text-[var(--muted)]">{g ? `Gr ${g}` : '-'}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </section>

      {/* Appearance */}
      <section className="space-y-2">
        <h2 className="section-title">Appearance</h2>
        <Card className="p-3">
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={cx(
                  'tap flex flex-col items-center gap-1 rounded-card border px-2 py-3 transition-colors',
                  theme === id ? 'border-gold bg-gold/15' : 'border-[var(--divider)] hover:border-royal',
                )}
              >
                <Icon className="h-5 w-5 text-royal dark:text-gold" />
                <span className="text-xs font-semibold text-[var(--text)]">{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      <NotificationsSection />

      {/* Demo time-travel: test/dev builds only, never in a production build. */}
      {process.env.NEXT_PUBLIC_TEST_ACCOUNTS === '1' && <DemoTimeTravel />}

      {/* Privacy */}
      <section className="space-y-2">
        <h2 className="section-title">Privacy</h2>
        <Card className="p-4">
          <p className="text-sm text-[var(--text)]">
            Your profile and schedule live only on this device. No ads, no trackers, no data
            sold.
          </p>
          <LinkButton href="/more/privacy/" variant="ghost" className="mt-3 w-full">
            Read the full privacy policy
          </LinkButton>
        </Card>
      </section>

      {/* Delete my data */}
      <section className="space-y-2">
        <h2 className="section-title">Delete my data</h2>
        <Card className="p-4">
          {!confirmReset ? (
            <Button variant="danger" className="w-full" onClick={() => setConfirmReset(true)}>
              Delete all my data
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text)]">
                This erases everything the app stores on this device: profile, schedule,
                and settings. You can&apos;t undo this.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    resetAll();
                    setConfirmReset(false);
                  }}
                >
                  Yes, delete everything
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
