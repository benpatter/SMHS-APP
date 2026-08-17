'use client';

import { ATTENDANCE } from '@/config/school';
import { telHref } from '@/lib/links';
import { effectiveSchool, useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { BackLink } from '@/components/BackLink';
import { LinkText } from '@/components/LinkText';
import { Card, LinkButton } from '@/components/ui';
import { PhoneIcon } from '@/components/icons';

export default function AttendancePage() {
  const mounted = useMounted();
  const override = useAppStore((s) => effectiveSchool(s.serverData, s.admin));
  const phone = (mounted && override.attendancePhone) || ATTENDANCE.phone;
  const phoneDisplay = (mounted && override.attendancePhoneDisplay) || ATTENDANCE.phoneDisplay;
  const procedure = (mounted && override.attendanceProcedure) || ATTENDANCE.procedure;
  const hours = (mounted && override.attendanceHours) || ATTENDANCE.hours;

  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Report an Absence</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Call the Attendance Office before the school day begins. Absences can only be reported
          by phone.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <LinkButton href={telHref(phone)} external variant="primary" className="py-3.5 text-base">
          <PhoneIcon className="h-5 w-5" /> Call {phoneDisplay}
        </LinkButton>
      </div>

      <Card className="p-4">
        <h2 className="section-title">How to report</h2>
        <p className="mt-2 text-sm text-[var(--text)]">
          <LinkText>{procedure}</LinkText>
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="section-title">Office hours</h2>
        <p className="mt-2 text-sm text-[var(--text)]">
          <LinkText>{hours}</LinkText>
        </p>
      </Card>
    </div>
  );
}
