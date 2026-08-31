'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { Announcement } from '@/config/announcements.seed';
import { fetchWeekly } from '@/lib/providers/live';
import { effectiveAnnouncements, useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { TEAMS } from '@/config/school';
import { openTeams } from '@/lib/links';
import { AnnouncementCard } from '@/components/AnnouncementCard';
import { NewsFeed } from '@/components/NewsFeed';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Button, Card, EmptyState, Segmented, Spinner, cx } from '@/components/ui';

export default function AnnouncementsPage() {
  const mounted = useMounted();
  /** Which feed is on screen: the Weekly board or the school's news boards. */
  const [source, setSource] = useState<'weekly' | 'news'>('weekly');
  const admin = useAppStore((s) => s.admin);
  const serverData = useAppStore((s) => s.serverData);
  /** Bumped by pull-to-refresh so the news feed reloads with everything else. */
  const [newsReload, setNewsReload] = useState(0);
  // The Teams shortcut is student-only; staff and parents get Weekly and News.
  const isStudent = useAppStore((s) => s.userRole !== 'staff' && s.userRole !== 'parent');

  // Paginated live weekly posts ("Load More" mirrors the smhs.org board).
  const [weeklyLive, setWeeklyLive] = useState<Announcement[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ok' | 'offline'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  // Admin notices (server-owned, cached on-device): all-school posts join Weekly.
  const adminWeekly = useMemo(
    () => effectiveAnnouncements(serverData, admin, null),
    [serverData, admin],
  );

  // Coming back from a story reopens the tab it came from ("?tab=news"). Read
  // from the URL rather than kept in the store: the back link is a plain <Link>
  // and a static export has no route-level state to carry.
  useEffect(() => {
    if (!mounted) return;
    if (new URLSearchParams(window.location.search).get('tab') === 'news') setSource('news');
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchWeekly(1)
      .then((r) => {
        if (!alive) return;
        if (r) {
          setWeeklyLive(r.items);
          setHasMore(r.hasMore);
          setPage(1);
          setStatus('ok');
        } else setStatus('offline');
      })
      .catch(() => alive && setStatus('offline'));
    return () => {
      alive = false;
    };
  }, [mounted]);

  // Pull-to-refresh: back to page one of the live feed, plus the admin notices.
  const syncServerData = useAppStore((s) => s.syncServerData);
  const refresh = useCallback(async () => {
    setNewsReload((n) => n + 1);
    const [r] = await Promise.all([fetchWeekly(1), syncServerData()]);
    if (r) {
      setWeeklyLive(r.items);
      setHasMore(r.hasMore);
      setPage(1);
      setStatus('ok');
      return true;
    }
    setStatus('offline');
    return false;
  }, [syncServerData]);

  // Channel pills only earn their space when the list mixes channels.
  const showChannel = useMemo(() => {
    const channels = new Set([...adminWeekly, ...weeklyLive].map((a) => a.channel));
    return channels.size > 1;
  }, [adminWeekly, weeklyLive]);

  const loadMore = async () => {
    setLoadingMore(true);
    const r = await fetchWeekly(page + 1);
    if (r) {
      setWeeklyLive((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...r.items.filter((p) => !seen.has(p.id))];
      });
      setHasMore(r.hasMore);
      setPage((p) => p + 1);
    } else setHasMore(false);
    setLoadingMore(false);
  };

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="space-y-4">
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Announcements</h1>

      {/* Weekly and News are two real feeds; Teams sits between them as a
          hand-off, not a tab — club/class chatter lives there, and it's the
          second place a student looks. On a phone it opens the Teams APP; it
          stays a real link so desktop keeps its new tab and the href still
          works if the hand-off can't run. */}
      <Segmented
        value={source}
        onChange={(v) => v !== 'teams' && setSource(v)}
        label="Announcement source"
        itemClassName="flex-1"
        options={[
          { value: 'weekly' as const, label: 'Weekly' },
          ...(isStudent
            ? [
                {
                  value: 'teams' as const,
                  label: 'Teams',
                  href: TEAMS.webBase,
                  external: true,
                  onClick: (e: MouseEvent<HTMLAnchorElement>) => {
                    if (openTeams()) e.preventDefault();
                  },
                },
              ]
            : []),
          { value: 'news' as const, label: 'News' },
        ]}
      />

      {/* Hidden, not unmounted, the same way Weekly is: switching tabs used to
          throw away every page of news the student had loaded and refetch from
          page one on the way back. */}
      <div className={cx(source !== 'news' && 'hidden')}>
        <NewsFeed reloadKey={newsReload} />
      </div>

      <div className={cx('space-y-3', source !== 'weekly' && 'hidden')}>
          {status === 'offline' && (
            <Card className="border-gold/40 bg-gold/10 p-3 text-xs text-[var(--muted)]">
              The live smhs.org weekly feed isn’t reachable right now. Admin notices still show below.
            </Card>
          )}

          {adminWeekly.map((a) => (
            <AnnouncementCard key={a.id} a={a} showChannel={showChannel} />
          ))}

          {status === 'loading' && <Spinner label="Loading announcements…" />}

          {status !== 'loading' &&
            weeklyLive.map((a) => (
              <AnnouncementCard
                key={a.id}
                a={a}
                href={`/announcements/read/?id=${encodeURIComponent(a.id)}`}
                showChannel={showChannel}
              />
            ))}

          {status === 'ok' && weeklyLive.length === 0 && adminWeekly.length === 0 && (
            <EmptyState title="Nothing new right now">Check back later for weekly updates.</EmptyState>
          )}

          {status === 'ok' && hasMore && (
            <Button variant="outline" className="w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
      </div>
    </div>
    </PullToRefresh>
  );
}
