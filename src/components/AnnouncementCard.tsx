'use client';

import Link from 'next/link';
import type { Announcement } from '@/config/announcements.seed';
import { formatRelative } from '@/lib/time';
import { LinkText } from './LinkText';
import { Card, Pill } from './ui';

export function AnnouncementCard({
  a,
  href,
  showChannel = true,
}: {
  a: Announcement;
  href?: string;
  // Hidden when the surrounding list has only one channel — the tag adds nothing then.
  showChannel?: boolean;
}) {
  const hasMeta = (showChannel && a.channel) || a.postedAt;
  const meta = hasMeta ? (
    <div className="mb-1.5 flex items-center gap-2">
      {showChannel && <Pill tone={a.audience === null ? 'royal' : 'gold'}>{a.channel}</Pill>}
      {a.postedAt && (
        <span className="ml-auto text-xs text-[var(--muted)]">{formatRelative(a.postedAt)}</span>
      )}
    </div>
  ) : null;

  // Weekly posts open a dedicated reading page; show a short preview + affordance.
  if (href) {
    return (
      <Link href={href} className="tap block">
        <Card className="p-4 transition-colors hover:border-royal">
          {meta}
          <h3 className="font-semibold text-[var(--text)]">{a.title}</h3>
          {a.body && <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{a.body}</p>}
          <div className="mt-2.5 text-xs font-semibold text-royal dark:text-gold">Read →</div>
        </Card>
      </Link>
    );
  }

  // Admin notices are short, so render inline. Only here are numbers and
  // addresses linked: the preview above lives inside a <Link>, and an anchor
  // can't nest.
  return (
    <Card className="p-4">
      {meta}
      <h3 className="font-semibold text-[var(--text)]">{a.title}</h3>
      {a.body && (
        <p className="mt-1 text-sm text-[var(--muted)]">
          <LinkText>{a.body}</LinkText>
        </p>
      )}
      <div className="mt-2.5 text-xs text-[var(--muted)]">{a.author}</div>
    </Card>
  );
}
