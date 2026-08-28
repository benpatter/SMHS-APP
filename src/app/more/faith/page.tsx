'use client';

import Link from 'next/link';
import { effectiveSchool, useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { BackLink } from '@/components/BackLink';
import { Card } from '@/components/ui';
import { ChevronRight } from '@/components/icons';

/** The Prayer Request Microsoft Form run by Campus Ministry (admin-overridable). */
const PRAYER_REQUEST_URL =
  'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=eUz7x9nGxEaboG2vvtqMKNLKXkJT7V5HufEY6X21865UNEo0VUk0MVgwTTczV1lBRzNUVUhFNDE0Ni4u';

/**
 * Faith: the heart of SMCHS's Catholic tradition in the app. A scripture
 * banner over two doors — the prayer book, and Campus Ministry's prayer
 * request form.
 */
export default function FaithPage() {
  const mounted = useMounted();
  const school = useAppStore((s) => effectiveSchool(s.serverData, s.admin));
  const prayerFormUrl = (mounted && school.prayerRequestFormUrl) || PRAYER_REQUEST_URL;

  return (
    <div className="space-y-4">
      <BackLink />
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Faith</h1>

      {/* Scripture banner: parchment field with a red bookmark ribbon. This is a
          deliberately FIXED light surface in both themes — it's a physical
          object, not a themed card, so its ink stays the dark hexes below. Only
          the edge is toned down in dark mode, where the pale border haloed. */}
      <div
        className="relative overflow-hidden rounded-card border border-[#d8cfba] px-5 py-6 shadow-sm dark:border-[#8d8163]"
        style={{ background: 'linear-gradient(135deg, #f7f2e4 0%, #efe7d2 100%)' }}
      >
        <span
          aria-hidden="true"
          className="absolute left-6 top-0 h-16 w-8 bg-[#9d1c20] shadow-sm"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)' }}
        />
        <p className="ml-16 text-right font-serif italic leading-relaxed text-[#3d3628]">
          Your word is a lamp for my feet, a light for my path.
          <span className="not-italic"> Ps 119:105</span>
        </p>
      </div>

      <Card className="divide-y divide-[var(--divider)] overflow-hidden">
        <Link
          href="/more/faith/prayers/"
          className="tap flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-royal/10 text-xl dark:bg-white/5">
            🙏
          </span>
          <span className="min-w-0 flex-1 font-semibold text-[var(--text)]">Prayers</span>
          <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
        </Link>

        <a
          href={prayerFormUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tap flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-royal/10 text-xl dark:bg-white/5">
            🕯️
          </span>
          <span className="min-w-0 flex-1 font-semibold text-[var(--text)]">Prayer Request</span>
          <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
        </a>
      </Card>
    </div>
  );
}
