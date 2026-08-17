/**
 * Student-facing pages an admin can pin a notice card to. Paths match
 * usePathname() with the trailing slash stripped. The school-wide banner
 * placement ('*') is offered separately in the notice editor.
 */
export const NOTICE_PAGES: { path: string; label: string }[] = [
  { path: '/', label: 'Home' },
  { path: '/calendar', label: 'Calendar' },
  { path: '/announcements', label: 'Announcements' },
  { path: '/announcements/read', label: 'Announcements Reader' },
  { path: '/more', label: 'More' },
  { path: '/more/schedule', label: 'Bell Schedules' },
  { path: '/more/clubs', label: 'Student Clubs' },
  { path: '/more/athletics', label: 'Athletics' },
  { path: '/more/menu', label: 'Campus Dining' },
  { path: '/more/map', label: 'Campus Map' },
  { path: '/more/faith', label: 'Faith' },
  { path: '/more/faith/prayers', label: 'Prayer Book' },
  { path: '/more/attendance', label: 'Attendance' },
  { path: '/more/contacts', label: 'Contacts' },
  { path: '/more/safety', label: 'Safety' },
  { path: '/parent', label: 'Parent Hub' },
];

/** Human label for a notice placement, for the admin list and picker. */
export function noticePageLabel(page: string): string {
  if (page === '*') return 'Every page (banner)';
  return NOTICE_PAGES.find((p) => p.path === page)?.label ?? page;
}
