'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import {
  encodeShare,
  decodeShare,
  compareSchedules,
  type SharePayload,
} from '@/lib/shareCodec';
import { BackLink } from '@/components/BackLink';
import { Button, Card, EmptyState, Pill } from '@/components/ui';
import { CheckIcon } from '@/components/icons';

export default function SharePage() {
  const mounted = useMounted();
  const schedule = useAppStore((s) => s.schedule);
  const profile = useAppStore((s) => s.profile);
  const importSchedule = useAppStore((s) => s.importSchedule);

  const [qr, setQr] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [incoming, setIncoming] = useState<SharePayload | null>(null);
  const [imported, setImported] = useState(false);

  const hasClasses = mounted && Object.keys(schedule).length > 0;

  const shareUrl = useMemo(() => {
    if (!mounted || !hasClasses) return '';
    const code = encodeShare({
      v: 1,
      schedule,
      name: profile.name || undefined,
    });
    return `${window.location.origin}/more/share/?s=${code}`;
  }, [mounted, hasClasses, schedule, profile.name]);

  // Read an incoming shared schedule from the URL (?s=...).
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get('s');
    if (s) setIncoming(decodeShare(s));
  }, [mounted]);

  // Render the QR for my schedule.
  useEffect(() => {
    if (!shareUrl) {
      setQr('');
      return;
    }
    QRCode.toDataURL(shareUrl, { margin: 1, width: 240, color: { dark: '#1A4784', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [shareUrl]);

  const matches = useMemo(
    () => (incoming ? compareSchedules(schedule, incoming.schedule) : []),
    [incoming, schedule],
  );

  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Share My Schedule</h1>
      </div>

      {/* Incoming shared schedule (someone opened your link / you opened theirs). */}
      {incoming && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Pill tone="gold">Shared schedule</Pill>
            {incoming.name && <span className="text-sm font-semibold text-[var(--text)]">{incoming.name}</span>}
          </div>

          {hasClasses ? (
            matches.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Classes you share:</p>
                <ul className="mt-2 space-y-1.5">
                  {matches.map((m) => (
                    <li key={m.periodNumber} className="flex items-center gap-2 text-sm">
                      <CheckIcon className="h-4 w-4 text-royal dark:text-gold" />
                      <span className="text-[var(--text)]">
                        Period {m.periodNumber}: {m.mine}
                        {m.sameRoom && ' · same room'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No periods in common with your schedule.</p>
            )
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Add your own classes to compare, or import this one as your schedule.
            </p>
          )}

          {!imported ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                importSchedule(incoming.schedule);
                setImported(true);
              }}
            >
              Import as my schedule
            </Button>
          ) : (
            <p className="flex items-center justify-center gap-1 text-sm font-semibold text-royal dark:text-gold">
              <CheckIcon className="h-4 w-4" /> Imported
            </p>
          )}
        </Card>
      )}

      {/* My share QR + link. */}
      {!hasClasses ? (
        <EmptyState title="Add classes first">
          You need at least one class in your schedule to share it.
        </EmptyState>
      ) : (
        <Card className="flex flex-col items-center gap-4 p-5">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for your schedule" width={240} height={240} className="rounded-card" />
          )}
          <p className="text-center text-xs text-[var(--muted)]">
            Have a friend scan this, or send them the link below.
          </p>
          <Button
            variant="primary"
            className="w-full"
            onClick={async () => {
              try {
                if (navigator.share) {
                  await navigator.share({ title: 'My SMCHS schedule', url: shareUrl });
                } else {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              } catch {
                /* user cancelled */
              }
            }}
          >
            {copied ? 'Link copied!' : 'Share link'}
          </Button>
        </Card>
      )}
    </div>
  );
}
