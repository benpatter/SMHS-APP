'use client';

import Link from 'next/link';
import { openAeries } from '@/lib/links';
import { useTipLineUrl } from '@/lib/providers/safety';
import { CrossIcon, GradIcon, PhoneIcon, ClockIcon, ShieldIcon, UtensilsIcon } from './icons';
import { cx } from './ui';

/**
 * Glanceable rows of shortcuts. Faith leads (our Catholic identity comes first),
 * then Grades (Aeries hand-off). Parents get the simplified set — no Campus
 * Dining — leaving room for their "Go back" button.
 *
 * The tip line gets the last row to itself, full width, for both students and
 * parents: reporting a safety concern is the one thing here nobody should have
 * to go hunting through More → Safety & Security for.
 */
export function QuickActions({ parent = false }: { parent?: boolean }) {
  return (
    <div className="space-y-2">
      {parent ? (
        <div className="grid grid-cols-4 gap-2">
          <IconTile href="/more/faith/" Icon={CrossIcon} label="Faith" />
          {/* Grades: hands off to Aeries, never rebuilt in-app. */}
          <IconTile onClick={openAeries} Icon={GradIcon} label="Grades" />
          <IconTile href="/more/schedule/" Icon={ClockIcon} label="Schedule" />
          <IconTile href="/more/attendance/" Icon={PhoneIcon} label="Absent?" />
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-2">
          <IconTile href="/more/faith/" Icon={CrossIcon} label="Faith" className="col-span-3" />
          {/* Grades: hands off to Aeries, never rebuilt in-app. */}
          <IconTile onClick={openAeries} Icon={GradIcon} label="Grades" className="col-span-3" />
          <IconTile href="/more/schedule/" Icon={ClockIcon} label="Schedule" className="col-span-2" />
          <IconTile href="/more/attendance/" Icon={PhoneIcon} label="Absent?" className="col-span-2" />
          <IconTile href="/more/menu/" Icon={UtensilsIcon} label="Dining" className="col-span-2" />
        </div>
      )}
      <TipLineTile />
    </div>
  );
}

/**
 * Report a safety concern, anonymously. Opens the school's real tip form; until
 * that URL has loaded (and if the proxy can't be reached at all) it goes to
 * Safety & Security, where the same button lives — never a dead tile.
 */
export function TipLineTile() {
  const tipUrl = useTipLineUrl();
  const cls =
    'app-card tap flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:border-royal';
  const inner = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-gold/20 text-gold-deep dark:bg-white/5 dark:text-gold">
        <ShieldIcon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text)]">Report a Tip</span>
        <span className="block truncate text-xs text-[var(--muted)]">Anonymous</span>
      </span>
    </>
  );
  return tipUrl ? (
    <a href={tipUrl} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href="/more/safety/" className={cls}>
      {inner}
    </Link>
  );
}

export function IconTile({
  Icon,
  label,
  sub,
  href,
  onClick,
  className,
}: {
  Icon: (p: { className?: string }) => JSX.Element;
  label: string;
  /** One-line hint under the label so the tile explains itself. */
  sub?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cx(
    'app-card tap flex flex-col items-center gap-1.5 px-1 py-3.5 text-center transition-colors hover:border-royal',
    className,
  );
  const inner = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-card bg-royal/10 text-royal dark:bg-white/5 dark:text-gold">
        <Icon className="h-6 w-6" />
      </span>
      <span className="w-full truncate text-xs font-semibold text-[var(--text)]">{label}</span>
      {sub && (
        <span className="w-full px-0.5 text-[10px] leading-tight text-[var(--muted)]">{sub}</span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
