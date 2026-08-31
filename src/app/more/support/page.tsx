'use client';

import { useEffect, useState } from 'react';
import { useMounted } from '@/lib/hooks';
import { track } from '@/lib/metrics';
import { fetchMyTickets, submitTicket, type MyTicket } from '@/lib/support';
import { formatRelative } from '@/lib/time';
import { BackLink } from '@/components/BackLink';
import { Button, Card, Field, Pill, TextArea, TextInput } from '@/components/ui';

/**
 * "Open a Support Ticket" — students, parents, and staff report a problem with
 * a subject line and a description. The sender stays anonymous: the ticket
 * carries only this device's random id, which is also how the resolution
 * notice finds its way back here.
 */
export default function SupportPage() {
  const mounted = useMounted();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** The ticket number just issued — drives the confirmation card. */
  const [sentNum, setSentNum] = useState<number | null>(null);
  const [mine, setMine] = useState<MyTicket[] | null>(null);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    void fetchMyTickets().then((t) => alive && setMine(t));
    return () => {
      alive = false;
    };
  }, [mounted, sentNum]);

  const send = async () => {
    setBusy(true);
    setError('');
    const r = await submitTicket(subject.trim(), body.trim(), email.trim() || undefined);
    setBusy(false);
    if (r.ok) {
      track('feature', 'support-ticket');
      setSentNum(r.num);
      setSubject('');
      setBody('');
      setEmail('');
    } else {
      setError(r.error);
    }
  };

  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Support Ticket</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Tell the school&apos;s app team what went wrong. Your ticket carries no name and no
          account, only what you type here.
        </p>
      </div>

      {sentNum !== null && (
        <Card className="border-gold/40 bg-gold/10 p-4">
          <p className="font-semibold text-[var(--text)]">Ticket {sentNum} is with the app team</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            You&apos;ll see a notice here once they resolve it. Write the number down if you want
            to follow up.
          </p>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <Field label="Subject">
          <TextInput
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            placeholder="e.g. Bell schedule shows the wrong day"
          />
        </Field>
        <Field label="What's the issue?">
          <TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            className="min-h-[120px]"
            placeholder="Say what happened, which screen you were on, and what you expected instead."
          />
        </Field>
        <Field
          label="Contact email (optional)"
          hint="The app team writes back only when they can't fix your ticket without you. Leave it blank to stay anonymous."
        >
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            placeholder="you@example.com"
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          className="w-full"
          disabled={busy || !subject.trim() || !body.trim()}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : 'Send ticket'}
        </Button>
      </Card>

      {mine !== null && mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Your tickets from this device</h2>
          <Card className="divide-y divide-[var(--divider)] overflow-hidden">
            {mine.map((t) => (
              <div key={t.num} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--text)]">
                    Ticket {t.num}: {t.subject}
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    {formatRelative(t.createdAt)}
                  </span>
                </span>
                <Pill tone={t.resolved ? 'gold' : 'muted'}>{t.resolved ? 'Resolved' : 'Open'}</Pill>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
