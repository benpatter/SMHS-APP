'use client';

import Link from 'next/link';
import { ChevronRight } from './icons';

/** Consistent "back to More" affordance for sub-pages. */
export function BackLink({ href = '/more/', label = 'More' }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="tap -ml-1 inline-flex items-center gap-1 text-sm font-semibold text-royal dark:text-gold"
    >
      <ChevronRight className="h-4 w-4 rotate-180" />
      {label}
    </Link>
  );
}
