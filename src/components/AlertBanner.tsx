'use client';

import { effectiveNotices, useAppStore, type PageNotice } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { cx } from './ui';

/** The banner strip's tone classes, shared with the admin editor's preview. */
export function bannerToneClass(tone: PageNotice['tone']): string {
  if (tone === 'urgent') return 'border-danger/40 bg-danger/10 text-danger';
  if (tone === 'gold') return 'border-gold/40 bg-gold/10 text-[var(--text)]';
  return 'border-royal/30 bg-royal/10 text-royal dark:text-[var(--text)]';
}

/**
 * School-wide banners an administrator can raise (closures, emergencies, info):
 * every notice placed on "Every page". Sits directly under the header on every
 * page. Hidden when none are active.
 */
export function AlertBanner() {
  const mounted = useMounted();
  const serverData = useAppStore((s) => s.serverData);
  const admin = useAppStore((s) => s.admin);

  if (!mounted) return null;
  const banners = effectiveNotices(serverData, admin).filter(
    (n) => n.page === '*' && n.message.trim(),
  );
  if (banners.length === 0) return null;

  return (
    <>
      {banners.map((n) => (
        <div
          key={n.id}
          role="alert"
          className={cx('border-b px-4 py-2.5 text-sm font-semibold', bannerToneClass(n.tone))}
        >
          <div className="mx-auto flex max-w-screen-sm items-start gap-2">
            <span aria-hidden="true">⚠</span>
            <span className="min-w-0 flex-1">{n.message}</span>
          </div>
        </div>
      ))}
    </>
  );
}
