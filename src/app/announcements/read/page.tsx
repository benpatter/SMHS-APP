'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchWeeklyPost } from '@/lib/providers/live';
import type { Announcement } from '@/config/announcements.seed';
import { useMounted } from '@/lib/hooks';
import { track } from '@/lib/metrics';
import { formatRelative } from '@/lib/time';
import { linkifyHtml } from '@/lib/linkify';
import { BackLink } from '@/components/BackLink';
import { Pill, Spinner, EmptyState } from '@/components/ui';

export default function ReadAnnouncementPage() {
  const mounted = useMounted();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<Announcement | null>(null);
  // The body arrives as sanitized markup, so the numbers in it are plain text
  // until we link them.
  const bodyHtml = useMemo(() => linkifyHtml(post?.bodyHtml || ''), [post]);

  useEffect(() => {
    if (!mounted) return;
    const id = new URLSearchParams(window.location.search).get('id');
    let alive = true;
    (id ? fetchWeeklyPost(id) : Promise.resolve(null))
      .then((p) => {
        if (!alive) return;
        setPost(p);
        setLoading(false);
        // An announcement was actually opened and read — the numerator of the
        // admin dashboard's open-rate metric.
        if (p) track('announcement');
      })
      .catch(() => {
        if (!alive) return;
        setPost(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mounted]);

  return (
    <div className="space-y-4">
      <BackLink href="/announcements/" label="Announcements" />

      {loading && <Spinner label="Loading…" />}

      {!loading && !post && (
        <EmptyState title="Post not found">
          This announcement may have rolled off. Head back to Announcements.
        </EmptyState>
      )}

      {!loading && post && (
        <article className="space-y-3">
          <div className="flex items-center gap-2">
            <Pill tone="royal">{post.channel}</Pill>
            {post.postedAt && (
              <span className="text-xs text-[var(--muted)]">{formatRelative(post.postedAt)}</span>
            )}
          </div>
          <h1 className="text-xl font-bold leading-snug text-[var(--text)]">{post.title}</h1>
          <div
            className="text-sm leading-relaxed text-[var(--text)] [&_a]:font-semibold [&_a]:text-brand [&_a]:underline dark:[&_a]:text-gold [&_b]:font-semibold [&_strong]:font-semibold [&_h2]:mt-4 [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mb-1 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </article>
      )}
    </div>
  );
}
