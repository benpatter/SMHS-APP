'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { setPassword } from '@/lib/portalAuth';
import { useAppStore } from '@/lib/store';
import { BackLink } from '@/components/BackLink';
import { Button, Card, Field, TextInput } from '@/components/ui';

/**
 * Landing page for the emailed password-setup link
 * (/portal/set-password/?token=…). One-time token; choose and confirm a
 * password, then sign in from the portals.
 */
export default function SetPasswordPage() {
  // Read the token client-side: this app is a static export, so query params
  // only exist in the browser.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  // Whoever opened this page is staff — it's reached from the emailed setup
  // link, often on a device that has never onboarded. Mark the device as a
  // staff device so the welcome overlay (which AppShell already keeps off THIS
  // page) doesn't ambush the "sign in now" links below once the password is set.
  const chooseStaff = useAppStore((s) => s.chooseStaff);
  const userRole = useAppStore((s) => s.userRole);
  useEffect(() => {
    if (userRole === null) chooseStaff();
  }, [userRole, chooseStaff]);

  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && pw !== confirm;

  const submit = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    const r = await setPassword(token, pw);
    setBusy(false);
    if (r.ok) setDoneEmail(r.email ?? '');
    else setError(r.error ?? 'Could not set the password');
  };

  return (
    <div className="space-y-4">
      <BackLink href="/portal/" label="SM T.E.A.M. Member Portals" />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Create your password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Set the password you&apos;ll use to sign in to the staff portals.
        </p>
      </div>

      {doneEmail !== null ? (
        <Card className="space-y-3 p-4">
          <p className="text-sm text-[var(--text)]">
            Your password is set{doneEmail ? ` for ${doneEmail}` : ''}. You can sign in now.
          </p>
          <div className="flex gap-2">
            <Link href="/portal/admin/" className="flex-1">
              <Button className="w-full">Admin portal</Button>
            </Link>
            <Link href="/portal/teacher/" className="flex-1">
              <Button variant="gold" className="w-full">
                Faculty & Staff
              </Button>
            </Link>
          </div>
        </Card>
      ) : token === '' ? (
        <Card className="p-4">
          <p className="text-sm text-[var(--muted)]">
            This page needs a setup link. Use the &ldquo;Create password&rdquo; button in a portal
            to get one emailed to you.
          </p>
        </Card>
      ) : (
        <Card className="space-y-3 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!mismatch && pw.length >= 6) void submit();
            }}
            className="space-y-3"
          >
            <Field label="New password" hint="At least 6 characters.">
              <TextInput
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setError('');
                }}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Confirm password">
              <TextInput
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                aria-invalid={mismatch}
              />
            </Field>
            {mismatch && <p className="text-sm text-danger">Passwords don&apos;t match.</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || pw.length < 6 || mismatch || token === null}
            >
              {busy ? 'Saving…' : 'Set password'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
