'use client';

import { useState } from 'react';
import { effectivePrayers, useAppStore } from '@/lib/store';
import { BackLink } from '@/components/BackLink';
import { Card, cx } from '@/components/ui';
import { ChevronRight } from '@/components/icons';

/**
 * The prayer book. Server-owned and admin-maintained (Admin -> Faith); the
 * bundled seed in config/prayers.seed.ts is the offline/fresh-device fallback.
 */
export default function PrayersPage() {
  const prayers = useAppStore((s) => effectivePrayers(s.serverData));
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <BackLink href="/more/faith/" label="Faith" />
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Prayers</h1>

      <Card className="divide-y divide-[var(--divider)] overflow-hidden">
        {prayers.map((p) => {
          const isOpen = open === p.id;
          return (
            <div key={p.id}>
              <button
                onClick={() => setOpen(isOpen ? null : p.id)}
                aria-expanded={isOpen}
                className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              >
                <span className="min-w-0 flex-1 font-semibold text-[var(--text)]">{p.title}</span>
                <ChevronRight
                  className={cx(
                    'h-5 w-5 text-[var(--muted)] transition-transform',
                    isOpen && 'rotate-90',
                  )}
                />
              </button>
              {isOpen && (
                <p className="whitespace-pre-line border-t border-[var(--divider)] bg-black/[0.02] px-4 py-4 font-serif leading-relaxed text-[var(--text)] dark:bg-white/[0.02]">
                  {p.text}
                </p>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
