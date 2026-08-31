'use client';

import { useEffect, useState } from 'react';
import { fetchMyTickets, markResolvedSeen, seenResolvedNums, type MyTicket } from '@/lib/support';
import { CheckIcon } from '@/components/icons';
import { Card } from '@/components/ui';

/**
 * "Your Support Ticket N was resolved." — shown once per ticket, to the device
 * that sent it. Ticket senders are anonymous, so this is the only channel a
 * resolution notice has: the device asks the server about its own tickets on
 * boot and surfaces any newly-resolved ones.
 */
export function SupportNotices() {
  const [resolved, setResolved] = useState<MyTicket[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchMyTickets().then((tickets) => {
      if (!alive || !tickets) return;
      const seen = new Set(seenResolvedNums());
      setResolved(tickets.filter((t) => t.resolved && !seen.has(t.num)));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (resolved.length === 0) return null;

  const dismiss = (num: number) => {
    markResolvedSeen([num]);
    setResolved((list) => list.filter((t) => t.num !== num));
  };

  return (
    <div className="mb-3 space-y-2">
      {resolved.map((t) => (
        <Card key={t.num} className="flex items-center gap-3 border-gold/40 bg-gold/10 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-gold/20 text-gold-deep dark:text-gold">
            <CheckIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--text)]">
              The app team resolved Ticket {t.num}
            </span>
            <span className="block truncate text-xs text-[var(--muted)]">{t.subject}</span>
          </span>
          <button
            onClick={() => dismiss(t.num)}
            className="tap shrink-0 text-xs font-bold text-royal dark:text-gold"
          >
            Got it
          </button>
        </Card>
      ))}
    </div>
  );
}
