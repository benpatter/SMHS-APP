'use client';

import { AdminGate } from '@/components/AdminGate';
import { NoticesEditor } from '@/components/AdminDashboard';

/**
 * Post, edit, or take down notices: the school-wide banner and info boxes
 * pinned to any page. Every device sees them.
 */
export default function AdminBannerPage() {
  return (
    <AdminGate title="Banner & Notices">
      <NoticesEditor />
    </AdminGate>
  );
}
