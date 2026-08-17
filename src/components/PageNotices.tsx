'use client';

import { usePathname } from 'next/navigation';
import { effectiveNotices, useAppStore, type PageNotice } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { Card, cx } from './ui';

/** The notice card's tone classes (the Club Rush look), shared with the admin editor. */
export function noticeCardClass(tone: PageNotice['tone']): string {
  if (tone === 'urgent') return 'border-danger/40 bg-danger/10';
  if (tone === 'info') return 'border-royal/30 bg-royal/10';
  return 'border-gold/40 bg-gold/10';
}

/**
 * Admin notice cards pinned to the current page (the Club Rush box on the clubs
 * page, generalized). Mounted once in AppShell above the page content, so a
 * notice can target any page without that page knowing about it.
 */
export function PageNotices() {
  const mounted = useMounted();
  const pathname = usePathname() || '/';
  const serverData = useAppStore((s) => s.serverData);
  const admin = useAppStore((s) => s.admin);

  if (!mounted) return null;
  const page = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const notices = effectiveNotices(serverData, admin).filter(
    (n) => n.page === page && n.message.trim(),
  );
  if (notices.length === 0) return null;

  return (
    <div className="mb-4 space-y-2.5">
      {notices.map((n) => (
        <Card key={n.id} className={cx('p-4', noticeCardClass(n.tone))}>
          {n.title?.trim() && <h2 className="section-title">{n.title}</h2>}
          <p className={cx('text-sm text-[var(--text)]', n.title?.trim() && 'mt-2')}>{n.message}</p>
        </Card>
      ))}
    </div>
  );
}
