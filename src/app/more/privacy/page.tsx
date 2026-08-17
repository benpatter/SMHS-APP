'use client';

import { BackLink } from '@/components/BackLink';
import { Card, LinkButton } from '@/components/ui';
import { mailtoHref } from '@/lib/links';

/** One short, plain-English policy card. */
function PolicyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="section-title">{title}</h2>
      <div className="mt-2 text-sm text-[var(--text)]">{children}</div>
    </Card>
  );
}

export default function PrivacyPage() {
  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Privacy</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          How this app handles student data.
        </p>
      </div>

      <PolicyCard title="Your data stays on your device">
        <p>
          Your profile and class schedule live only in this browser&apos;s local
          storage. They never leave your phone. Delete the app (or use Settings → Delete My Data) and all
          of it is gone. There are no accounts and nothing to reset.
        </p>
      </PolicyCard>

      <PolicyCard title="What the server ever sees">
        <p>
          School content only: schedules, announcements, notices, and the other shared school
          data every device shows. Nothing personal about you is sent — the server never sees
          your name, schedule, or profile.
        </p>
      </PolicyCard>

      <PolicyCard title="No tracking, no ads">
        <p>
          This app runs no ad SDKs, no third-party trackers, and no tracking cookies. We do not
          sell or share your personal information, build profiles of you, or collect your
          location.
        </p>
      </PolicyCard>

      <PolicyCard title="Anonymous usage statistics">
        <p>
          To help the school improve the app, it reports anonymous usage events (a screen was
          opened, a session ended) tagged with a random device ID and your role (student,
          parent, or staff) — never your name, email, schedule, or location. There is no
          cookie, the ID links to nothing about you, only combined totals are ever shown to
          school administrators, and every usage record is permanently deleted 30 days after
          collection. Support tickets you choose to send are kept, and they are anonymous too
          unless you decide to include a contact email for follow-up.
        </p>
      </PolicyCard>

      <PolicyCard title="California student privacy (SOPIPA)">
        <p>
          As a service used at a K-12 school, we follow SOPIPA (Bus. &amp; Prof. Code § 22584): no
          targeted advertising, no profiling of students, no sale of student data. We honor
          deletion requests, and you can delete most of your data yourself.
        </p>
      </PolicyCard>

      <PolicyCard title="CCPA/CPRA & minors">
        <p>
          We do not sell or share personal information as the CCPA/CPRA defines those terms. For
          anyone under 16, a sale or share would require opt-in consent (Civ. Code
          § 1798.120(c)), and none occurs. You exercise your rights to know and delete through the
          in-app delete and the school office.
        </p>
      </PolicyCard>

      <PolicyCard title="Right to delete (SB 568 'Online Eraser')">
        <p>
          California minors have the right to remove content they posted. You can delete anything
          you enter here: erase your profile and every other byte the app stores whenever you
          want.
        </p>
      </PolicyCard>

      <PolicyCard title="School records (FERPA)">
        <p>
          The app stores nothing that resembles an education record: grades and assignments are
          links out to the school&apos;s own systems (Aeries, Teams).
        </p>
      </PolicyCard>

      <PolicyCard title="Questions">
        <p>
          This page describes the app as built; the school&apos;s official policies govern. Privacy
          questions go to the school: the front office number is on the Contacts page, or email:
        </p>
        <LinkButton href={mailtoHref('info@smhs.org')} variant="outline" className="mt-3 w-full">
          Email info@smhs.org
        </LinkButton>
      </PolicyCard>
    </div>
  );
}
