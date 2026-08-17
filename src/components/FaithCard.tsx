'use client';

import Link from 'next/link';
import { CrossIcon, ChevronRight } from './icons';
import { Card } from './ui';

/**
 * The Faith shortcut: our Catholic traditions, first in Quick Access on every
 * portal — student, parent, and staff alike.
 */
export function FaithCard() {
  return (
    <Link href="/more/faith/" className="tap block w-full text-left">
      <Card className="flex items-center gap-3 p-4 transition-colors hover:border-royal">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-royal text-white">
          <CrossIcon className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[var(--text)]">Faith</span>
          <span className="block text-xs text-[var(--muted)]">Prayers & prayer requests</span>
        </span>
        <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
      </Card>
    </Link>
  );
}
