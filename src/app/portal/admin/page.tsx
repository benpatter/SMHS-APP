'use client';

import { useCallback } from 'react';
import { PortalGate, ADMIN_DEPARTMENTS, isAdminEligible } from '@/components/PortalGate';
import { QuickActions } from '@/components/QuickActions';
import { SectionTitle } from '@/components/ui';
import { useAdminGrants } from '@/lib/providers/adminGrants';
import type { StaffMember } from '@/lib/providers/staff';

/**
 * The Admin portal home: same glanceable day view and quick actions as the
 * student home. Admin tools live behind the Admin tab in the bottom nav.
 * Access is limited to the Dean's Office, Educational Technology,
 * President's Office, and Principal's Office — plus school leaders granted
 * access by directory title (the Rector), plus anyone granted access by hand
 * from Administration → Admins. See isAdminEligible.
 */
export default function AdminPortalPage() {
  const grants = useAdminGrants();
  const staffFilter = useCallback((s: StaffMember) => isAdminEligible(s, grants), [grants]);
  return (
    <PortalGate
      role="admin"
      title="Admin Portal"
      subtitle="For the Rector and the Dean's, Ed Tech, President's, and Principal's offices."
      staffFilter={staffFilter}
      departmentOptions={ADMIN_DEPARTMENTS}
      dayGlance
    >
      <section>
        <SectionTitle className="mb-2">Quick Access</SectionTitle>
        <QuickActions />
      </section>
    </PortalGate>
  );
}
