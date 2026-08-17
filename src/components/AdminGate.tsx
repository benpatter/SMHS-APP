'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/lib/store';
import { getSessionToken } from '@/lib/portalAuth';
import { useMounted } from '@/lib/hooks';
import { BackLink } from './BackLink';
import { Button, Card, Field, TextInput, Spinner } from './ui';

/**
 * Wraps every admin screen. There are no accounts, so access is gated by a staff
 * passcode held on-device. The first passcode entered becomes the admin PIN; the
 * unlocked state is session-only (never persisted) so closing the app re-locks.
 */
export function AdminGate({
  title,
  backHref = '/admin/',
  backLabel = 'Admin',
  children,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const mounted = useMounted();
  const unlocked = useAppStore((s) => s.adminUnlocked);
  const pinIsSet = useAppStore((s) => s.admin.pin !== null);
  const unlockAdmin = useAppStore((s) => s.unlockAdmin);

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!mounted) return <Spinner />;

  if (!unlocked) {
    const creating = !pinIsSet;
    return (
      <div className="space-y-4">
        <BackLink />
        <div>
          <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Administration</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Staff access only.</p>
        </div>
        <Card className="space-y-3 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ok = unlockAdmin(pin);
              if (!ok) setError(true);
              else setError(false);
              setPin('');
            }}
            className="space-y-3"
          >
            <Field
              label={creating ? 'Create a staff passcode' : 'Staff passcode'}
              hint={
                creating
                  ? 'This device has no passcode yet. The code you enter becomes the admin passcode. Unlocking is per-device — sign in to the Staff Portal to sync edits everywhere.'
                  : 'Unlocking is per-device. Sign in to the Staff Portal to sync edits to all devices.'
              }
            >
              <TextInput
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(false);
                }}
                placeholder="••••"
                aria-invalid={error}
              />
            </Field>
            {error && <p className="text-sm text-danger">Incorrect passcode. Try again.</p>}
            <Button type="submit" className="w-full" disabled={!pin.trim()}>
              {creating ? 'Set passcode & continue' : 'Unlock'}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink href={backHref} label={backLabel} />
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">{title}</h1>
      <SyncWarning />
      {children}
    </div>
  );
}

/**
 * PIN unlock is device-local — without a staff portal sign-in, edits save on
 * this device but can't reach the server (and other devices). Say so loudly;
 * silently losing edits is how "deleted" data comes back.
 */
function SyncWarning() {
  const syncError = useAppStore((s) => s.dataSyncError);
  const conflictDiscarded = useAppStore((s) => s.dataConflictDiscarded);
  const forbidden = useAppStore((s) => s.dataForbidden);
  const sessionExpired = useAppStore((s) => s.staffSessionExpired);
  const dismissConflict = useAppStore((s) => s.dismissConflictNotice);
  const [hasToken, setHasToken] = useState(true); // assume ok until mounted
  useEffect(() => setHasToken(Boolean(getSessionToken())), []);
  // A token the server has since rejected is no better than no token at all:
  // edits save locally and go nowhere. Say so before the first push fails,
  // rather than after an admin has typed a page of changes.
  const signedIn = hasToken && !sessionExpired;
  // An unsynced edit was thrown away because someone else's newer work won.
  // That has to be said out loud — the whole point is that it must be redone.
  if (conflictDiscarded) {
    return (
      <Card className="border-danger/40 p-3 text-sm">
        <p className="font-semibold text-danger">An unsaved change was discarded.</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Someone else edited this before your change reached the server, so theirs was kept.
          Check your change and make it again if it is still needed.
        </p>
        <button
          onClick={dismissConflict}
          className="tap mt-1.5 text-xs font-bold text-royal dark:text-gold"
        >
          Got it
        </button>
      </Card>
    );
  }
  // The server rejected this account, which no amount of waiting will fix.
  // Saying "the server is unreachable" here would send an admin chasing an
  // outage that isn't happening.
  if (forbidden) {
    return (
      <Card className="border-danger/40 p-3 text-sm">
        <p className="font-semibold text-danger">This account can&rsquo;t publish changes.</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Edits are saved on this device only. Publishing to everyone is limited to app
          administrators, and the sign-in may also have expired.
        </p>
        <Link href="/portal" className="mt-1.5 inline-block text-xs font-bold text-royal dark:text-gold">
          Sign in again →
        </Link>
      </Card>
    );
  }
  if (signedIn && !syncError) return null;
  return (
    <Card className="border-danger/40 p-3 text-sm">
      <p className="font-semibold text-danger">Changes are not syncing to other devices.</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        {signedIn
          ? 'The server is unreachable. Edits save on this device and sync once it is back.'
          : 'The staff passcode only unlocks this device. Sign in to the Staff Portal once so edits sync to everyone.'}
      </p>
      {!signedIn && (
        <Link href="/portal" className="mt-1.5 inline-block text-xs font-bold text-royal dark:text-gold">
          Open Staff Portal →
        </Link>
      )}
    </Card>
  );
}
