'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchClubs, type Club, type ClubsInfo } from '@/lib/providers/live';
import { mailtoHref } from '@/lib/links';
import { useMounted } from '@/lib/hooks';
import { BackLink } from '@/components/BackLink';
import { LinkText } from '@/components/LinkText';
import { Card, EmptyState, LinkButton, Pill, Spinner, TextInput, cx } from '@/components/ui';

const CLUBS_URL = 'https://www.smhs.org/campus-life/clubs';

function ClubCard({ club, expanded, onToggle }: { club: Club; expanded: boolean; onToggle: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-[var(--text)]">{club.name}</p>
        {club.category && (
          <Pill tone="royal" className="shrink-0">
            {club.category}
          </Pill>
        )}
      </div>
      {club.description && (
        <p
          className={cx('mt-1 text-sm text-[var(--muted)]', !expanded && 'line-clamp-3')}
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onToggle();
          }}
        >
          <LinkText>{club.description}</LinkText>
        </p>
      )}
      {(club.moderator || club.email) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {club.moderator && (
            <span className="text-xs text-[var(--muted)]">Moderator: {club.moderator}</span>
          )}
          {club.email && (
            <a
              href={mailtoHref(club.email, 'Club interest: ' + club.name)}
              className="tap-expand text-xs font-semibold text-royal dark:text-gold"
            >
              Email the moderator
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ClubsPage() {
  const mounted = useMounted();
  const [info, setInfo] = useState<ClubsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchClubs().then((data) => {
      if (!alive) return;
      setInfo(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [mounted]);

  const categories = useMemo(() => {
    if (!info) return [];
    return Array.from(new Set(info.clubs.map((c) => c.category).filter(Boolean))).sort();
  }, [info]);

  const filtered = useMemo(() => {
    if (!info) return [];
    const q = query.trim().toLowerCase();
    return info.clubs.filter((c) => {
      if (category !== 'All' && c.category !== category) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [info, query, category]);

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Student Clubs</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {info
            ? `${info.clubs.length} clubs · ${info.year}`
            : 'The full SMCHS club directory.'}
        </p>
      </div>

      {!mounted || loading ? (
        <Spinner label="Loading live club directory…" />
      ) : !info ? (
        <Card className="p-5 text-center">
          <p className="font-semibold text-[var(--text)]">Live data unavailable right now</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            We couldn&apos;t reach the club directory. Check the real page instead.
          </p>
          <div className="mt-4 flex justify-center">
            <LinkButton href={CLUBS_URL} external variant="primary">
              Clubs on smhs.org
            </LinkButton>
          </div>
        </Card>
      ) : (
        <>
          <TextInput
            type="search"
            placeholder="Search clubs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search clubs"
            className="mt-0"
          />

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {['All', ...categories].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="tap focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  onClick={() => setCategory(cat)}
                  aria-pressed={category === cat}
                >
                  <Pill tone={category === cat ? 'royal' : 'muted'}>{cat}</Pill>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState title="No clubs match your search">
              Try a different name or category.
            </EmptyState>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((club) => (
                <ClubCard
                  key={club.name}
                  club={club}
                  expanded={expanded.has(club.name)}
                  onToggle={() => toggleExpanded(club.name)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
