'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import {
  encodeShare,
  decodeShare,
  comparePeriods,
  togetherCount,
  type PeriodComparison,
} from '@/lib/shareCodec';
import type { SharePayload } from '@/lib/shareCodec';
import { childScheduleLabel, type PersonalClass } from '@/lib/types';
import { BackLink } from '@/components/BackLink';
import { Button, Card, EmptyState, Pill } from '@/components/ui';

export default function SharePage() {
  const mounted = useMounted();
  const schedule = useAppStore((s) => s.schedule);
  const profile = useAppStore((s) => s.profile);

  const [qr, setQr] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [incoming, setIncoming] = useState<SharePayload | null>(null);

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

  const rows = useMemo(
    () => (incoming ? comparePeriods(schedule, incoming.schedule) : []),
    [incoming, schedule],
  );
  const together = togetherCount(rows);

  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Share My Schedule</h1>
      </div>

      {/* A friend's schedule, opened from their link or QR. READ-ONLY: this
          view never touches the viewer's own schedule. It used to offer to
          import theirs over yours, which is the opposite of what anyone opening
          a friend's link wants. */}
      {incoming && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 bg-royal/5 px-4 py-2.5 dark:bg-white/5">
            <span className="min-w-0 truncate font-semibold text-[var(--text)]">
              {incoming.name ? childScheduleLabel(incoming.name) : 'Shared Schedule'}
            </span>
            {hasClasses && (
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">
                {together === 0
                  ? 'No classes together'
                  : `${together} class${together === 1 ? '' : 'es'} together`}
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">
              This link doesn&apos;t carry any classes.
            </p>
          ) : (
            <div className="divide-y divide-[var(--divider)]">
              {rows.map((row) => (
                <PeriodRow key={row.periodNumber} row={row} showMine={hasClasses} />
              ))}
            </div>
          )}

          {!hasClasses && (
            <Link
              href="/more/schedule/"
              className="flex items-center gap-2 border-t border-[var(--divider)] px-4 py-3 text-sm font-semibold text-royal transition-colors hover:bg-black/[0.02] dark:text-gold dark:hover:bg-white/[0.02]"
            >
              Add your classes to see which ones you share →
            </Link>
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

/** "AP Biology" / "Free" / "—" for one side of a block. */
function classLabel(c: PersonalClass | undefined, periodNumber: number): string {
  if (!c) return '—';
  if (c.free) return 'Free';
  return c.name?.trim() || `Period ${periodNumber}`;
}

/** The teacher/room line under a class, when either was filled in. */
function classDetail(c: PersonalClass | undefined): string {
  if (!c || c.free) return '';
  return [c.teacher?.trim(), c.room?.trim()].filter(Boolean).join(' · ');
}

/**
 * One block: their class, and yours beside it. Their side leads — the point of
 * opening someone's link is to read THEIR day — with the match called out only
 * when the two entries actually agree (see comparePeriods).
 */
function PeriodRow({ row, showMine }: { row: PeriodComparison; showMine: boolean }) {
  const detail = classDetail(row.theirs);
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className="w-7 shrink-0 pt-0.5 text-xs font-bold text-[var(--muted)]">
        P{row.periodNumber}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 font-semibold text-[var(--text)]">
            {classLabel(row.theirs, row.periodNumber)}
          </span>
          {row.together ? (
            <Pill tone="gold" className="shrink-0">
              Together
            </Pill>
          ) : row.otherSection ? (
            <Pill tone="muted" className="shrink-0">
              Other section
            </Pill>
          ) : null}
        </div>
        {detail && <p className="mt-0.5 text-xs text-[var(--muted)]">{detail}</p>}
        {showMine && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            You: {classLabel(row.mine, row.periodNumber)}
          </p>
        )}
      </div>
    </div>
  );
}
