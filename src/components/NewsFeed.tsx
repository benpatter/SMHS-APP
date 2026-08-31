'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchNews, type NewsItem } from '@/lib/providers/live';
import { useMounted } from '@/lib/hooks';
import { formatRelative } from '@/lib/time';
import { Button, Card, EmptyState, Pill, Spinner } from '@/components/ui';

/**
 * School news, straight from smhs.org: the Campus News, Arts News and Sports
 * News boards merged into one newest-first feed (see /api/news). Tapping a
 * story opens it inside the app, the same reading page the Weekly board uses.
 *
 * Nothing is cached on the device, so with the proxy unreachable this says so
 * rather than showing an empty feed that looks like the school posted nothing.
 */
export function NewsFeed({ reloadKey = 0 }: { reloadKey?: number }) {
  const mounted = useMounted();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ok' | 'offline'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchNews(1)
      .then((r) => {
        if (!alive) return;
        if (r) {
          setItems(r.items);
          setHasMore(r.hasMore);
          setPage(1);
          setStatus('ok');
        } else setStatus('offline');
      })
      .catch(() => alive && setStatus('offline'));
    return () => {
      alive = false;
    };
  }, [mounted, reloadKey]);

  const loadMore = async () => {
    setLoadingMore(true);
    const r = await fetchNews(page + 1);
    if (r) {
      // The three boards run at different lengths, so a later page can repeat a
      // story the previous one already carried.
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...r.items.filter((p) => !seen.has(p.id))];
      });
      setHasMore(r.hasMore);
      setPage((p) => p + 1);
    } else setHasMore(false);
    setLoadingMore(false);
  };

  if (status === 'loading') return <Spinner label="Loading news…" />;

  if (status === 'offline') {
    return (
      <Card className="border-gold/40 bg-gold/10 p-3 text-xs text-[var(--muted)]">
        The smhs.org news feed isn’t reachable right now. Try again once you’re back online.
      </Card>
    );
  }

  if (items.length === 0) {
    return <EmptyState title="No stories yet">New stories land here as the school posts them.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {items.map((it) => (
        <NewsCard key={it.id} item={it} />
      ))}
      {hasMore && (
        <Button variant="outline" className="w-full" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

/**
 * One story: a small square thumbnail beside the text, not a banner across the
 * card. The school posts portraits, posters and group shots at every aspect
 * ratio, and a wide banner crop cut the heads off half of them (and pushed two
 * stories per screen). A square crops from the middle of the frame, so it stays
 * a recognizable preview whatever shape the original is.
 */
function NewsCard({ item }: { item: NewsItem }) {
  return (
    <Link href={`/announcements/read/?id=${encodeURIComponent(item.id)}`} className="tap block">
      <Card className="flex gap-3 p-3.5 transition-colors hover:border-royal">
        {item.image && (
          // Plain <img>, not next/image: the build is a static export with
          // images.unoptimized, and these files live on the school's CDN.
          <img
            src={item.image}
            alt=""
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded-card bg-black/5 object-cover dark:bg-white/5"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <Pill tone="royal">{item.channel}</Pill>
            {item.postedAt && (
              <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">
                {formatRelative(item.postedAt)}
              </span>
            )}
          </div>
          <h3 className="font-semibold leading-snug text-[var(--text)]">{item.title}</h3>
          <div className="mt-2 text-xs font-semibold text-royal dark:text-gold">Read →</div>
        </div>
      </Card>
    </Link>
  );
}
