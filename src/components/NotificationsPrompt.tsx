'use client';

import { useEffect, useState } from 'react';
import { enablePush, pushPermission, pushSupported } from '@/lib/push';
import { BellIcon } from '@/components/icons';
import { Button, Card } from '@/components/ui';

const DISMISS_KEY = 'smchs-push-prompt-dismissed';

/**
 * One-time nudge on Home: turn on schedule-change alerts. Rendered only where
 * asking can succeed (push supported, permission not yet decided), and never
 * again once the question has been answered or dismissed. Settings keeps the
 * permanent on/off control.
 */
export function NotificationsPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // storage blocked: still offer once per load
    }
    setShow(pushSupported() && pushPermission() === 'default');
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage blocked: the card returns next load, which is fine
    }
    setShow(false);
  };

  const turnOn = async () => {
    setBusy(true);
    await enablePush();
    // Granted or refused, the question has been asked: the card is done.
    dismiss();
  };

  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-gold/20 text-gold-deep dark:text-gold">
        <BellIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text)]">Schedule alerts</span>
        <span className="block text-xs text-[var(--muted)]">
          Get a notification when a day&apos;s schedule changes.
        </span>
      </span>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button size="sm" disabled={busy} onClick={() => void turnOn()}>
          Turn on
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={dismiss}>
          Not now
        </Button>
      </div>
    </Card>
  );
}
