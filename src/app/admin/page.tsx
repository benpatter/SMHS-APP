'use client';

import { AdminGate } from '@/components/AdminGate';
import { ManageSection } from '@/components/AdminDashboard';

export default function AdminDashboardPage() {
  return (
    <AdminGate title="Administration" backHref="/more/" backLabel="More">
      <ManageSection />
    </AdminGate>
  );
}
