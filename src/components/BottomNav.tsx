'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { CalendarIcon, GridIcon, HomeIcon, MegaphoneIcon, ShieldIcon } from './icons';
import { cx } from './ui';

const STUDENT_HOME = {
  href: '/',
  label: 'Home',
  Icon: HomeIcon,
  match: (p: string) => p === '/',
};

// Staff home is their signed-in portal.
const staffHome = (portal: string) => ({
  href: `/portal/${portal}/`,
  label: 'Home',
  Icon: HomeIcon,
  match: (p: string) => p === '/' || p.startsWith('/portal'),
});

const SHARED_TABS = [
  {
    href: '/announcements/',
    label: 'Announcements',
    Icon: MegaphoneIcon,
    match: (p: string) => p.startsWith('/announcements'),
  },
  {
    href: '/calendar/',
    label: 'Calendar',
    Icon: CalendarIcon,
    match: (p: string) => p.startsWith('/calendar'),
  },
  { href: '/more/', label: 'More', Icon: GridIcon, match: (p: string) => p.startsWith('/more') },
];

// Admins get a fifth tab: the admin tools (the icon-tile grid at /admin/).
const ADMIN_TAB = {
  href: '/admin/',
  label: 'Admin',
  Icon: ShieldIcon,
  match: (p: string) => p.startsWith('/admin'),
};

export function BottomNav() {
  const pathname = usePathname() || '/';
  const mounted = useMounted();
  const isStaff = useAppStore((s) => s.userRole === 'staff');
  const staffProfile = useAppStore((s) => s.staffProfile);
  const adminUnlocked = useAppStore((s) => s.adminUnlocked);
  const portalUser = useAppStore((s) => s.portalUser);
  // Same gate as More's Manage section: portal admins and passcode holders,
  // not teachers (who also unlock).
  const isAdmin = mounted && adminUnlocked && portalUser?.role !== 'teacher';

  const tabs = [
    mounted && isStaff && staffProfile ? staffHome(staffProfile.portal) : STUDENT_HOME,
    ...SHARED_TABS,
    ...(isAdmin ? [ADMIN_TAB] : []),
  ];
  return (
    <nav
      // In normal flow as the shell's last row, not fixed: the shell is exactly
      // one viewport tall, so the nav sits on the bottom edge without needing
      // page padding reserved beneath it.
      className="safe-bottom safe-x z-40 shrink-0 border-t border-[var(--divider)] bg-[var(--surface)]"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-screen-sm">
        {tabs.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'tap flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
                  active ? 'text-brand' : 'text-[var(--muted)] hover:text-[var(--text)]',
                )}
              >
                <Icon className={cx('h-6 w-6', active && 'text-brand')} />
                <span>{label}</span>
                <span
                  className={cx(
                    'mt-0.5 h-0.5 w-6 rounded-full',
                    active ? 'bg-gold' : 'bg-transparent',
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
