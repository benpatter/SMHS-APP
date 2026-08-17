'use client';

import { useMemo, useState } from 'react';
import {
  MAIN_OFFICE_ENTRY_ID,
  PARENT_LIAISON_ENTRY_ID,
  SCHOOL_OFFICE_GROUP_ID,
  contactPhoneLabel,
  contactTel,
  type Contact,
  type ContactEntry,
  type ContactGroup,
} from '@/config/contacts';
import { effectiveContacts, useAppStore } from '@/lib/store';
import { mailtoHref } from '@/lib/links';
import { BackLink } from '@/components/BackLink';
import { LinkText } from '@/components/LinkText';
import { Card, EmptyState, LinkButton, SectionTitle, TextInput, cx } from '@/components/ui';
import { ChevronRight, MailIcon, PhoneIcon } from '@/components/icons';

/** One reachable person or office, with its tap targets. */
function ContactRow({ c }: { c: Contact }) {
  const phoneLabel = contactPhoneLabel(c);
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="font-semibold text-[var(--text)]">{c.name}</div>
      {c.role && <div className="text-xs text-[var(--muted)]">{c.role}</div>}
      {/* tel:/mailto: are NOT `external` — that would open a blank tab beside
          the dialer/mail client. Only the web link opens in a new tab. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {c.phone && (
          <LinkButton href={contactTel(c.phone)} variant="outline" className="flex-[1_1_11rem]">
            <PhoneIcon className="h-4 w-4 shrink-0" />
            <span className="tnum">{phoneLabel}</span>
          </LinkButton>
        )}
        {c.email && (
          <LinkButton href={mailtoHref(c.email)} variant="outline" className="flex-[1_1_11rem]">
            <MailIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{c.email}</span>
          </LinkButton>
        )}
        {c.url && (
          <LinkButton href={c.url} variant="outline" external className="flex-[1_1_11rem]">
            {c.urlLabel ?? 'Open page'}
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function EntryCard({ entry }: { entry: ContactEntry }) {
  return (
    <Card className="p-4">
      <p className="font-bold text-[var(--text)]">{entry.topic}</p>

      {entry.steps && (
        <ol className="mt-2 space-y-1.5">
          {entry.steps.map((step, i) => (
            <li key={i} className="flex gap-2 text-sm text-[var(--muted)]">
              <span className="tnum mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal/10 text-[11px] font-bold text-brand dark:bg-white/5 dark:text-gold">
                {i + 1}
              </span>
              <span>
                <LinkText>{step}</LinkText>
              </span>
            </li>
          ))}
        </ol>
      )}

      {entry.note && (
        <p className="mt-2 text-sm text-[var(--muted)]">
          <LinkText>{entry.note}</LinkText>
        </p>
      )}

      {entry.handles && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[var(--muted)]">
          {entry.handles.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      {entry.contacts && (
        <div className="mt-3 divide-y divide-[var(--divider)]">
          {entry.contacts.map((c) => (
            <ContactRow key={c.id} c={c} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** Everything the search box matches an entry on. */
function entryText(entry: ContactEntry): string {
  return [
    entry.topic,
    entry.note ?? '',
    ...(entry.steps ?? []),
    ...(entry.handles ?? []),
    ...(entry.keywords ?? []),
    ...(entry.contacts ?? []).flatMap((c) => [c.name, c.role ?? '', c.email ?? '', c.phone ?? '']),
  ]
    .join(' ')
    .toLowerCase();
}

export default function ContactsPage() {
  // Server-owned: whatever an administrator last published, seed until then.
  // The selector returns the stored list as-is (a stable reference); hidden
  // topics — admin-only — are filtered out here.
  const published = useAppStore((s) => effectiveContacts(s.serverData));
  const groups = useMemo(
    () =>
      published
        .map((g) => ({ ...g, entries: g.entries.filter((e) => !e.hidden) }))
        .filter((g) => g.entries.length > 0),
    [published],
  );
  // A directory published before the School Office group existed still needs
  // the school's own card: fall back to the seed's copy of those two topics.
  const carded = useMemo(() => {
    const source = published.some((g) => g.id === SCHOOL_OFFICE_GROUP_ID)
      ? groups
      : effectiveContacts(null);
    const entries = source.flatMap((g) => g.entries);
    return {
      liaison: entries.find((e) => e.id === PARENT_LIAISON_ENTRY_ID) ?? null,
      mainOffice: entries.find((e) => e.id === MAIN_OFFICE_ENTRY_ID) ?? null,
    };
  }, [published, groups]);
  const [query, setQuery] = useState('');
  // Groups are collapsed by default so the whole directory fits a thumb's reach;
  // a search auto-opens whatever it matches.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();

  // The school office's two topics get their own cards below, so they're kept
  // out of the browsable list instead of appearing twice.
  const results = useMemo<ContactGroup[]>(() => {
    const listed = groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter(
          (e) => e.id !== PARENT_LIAISON_ENTRY_ID && e.id !== MAIN_OFFICE_ENTRY_ID,
        ),
      }))
      .filter((g) => g.entries.length > 0);
    if (!q) return listed;
    return listed
      .map((g) => {
        // A group title match ("athletics") keeps the whole group.
        const titleHit = g.title.toLowerCase().includes(q);
        const entries = titleHit ? g.entries : g.entries.filter((e) => entryText(e).includes(q));
        return { ...g, entries };
      })
      .filter((g) => g.entries.length > 0);
  }, [groups, q]);

  const mainOfficePhone = carded.mainOffice?.contacts?.find((c) => c.phone)?.phone ?? '';

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <BackLink />

      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Contacts</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Who to ask at SMCHS, and how to reach them. Tap a number to call, an address to email.
        </p>
      </div>

      <TextInput
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a topic, office, or name"
        aria-label="Search contacts"
      />

      {!q && carded.liaison && (
        <Card className="p-4">
          <p className="font-bold text-[var(--text)]">{carded.liaison.topic}?</p>
          {carded.liaison.note && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              <LinkText>{carded.liaison.note}</LinkText>
            </p>
          )}
          <div className="mt-2 divide-y divide-[var(--divider)]">
            {(carded.liaison.contacts ?? []).map((c) => (
              <ContactRow key={c.id} c={c} />
            ))}
          </div>
        </Card>
      )}

      {results.length === 0 ? (
        <EmptyState title={`Nothing matches \u201C${query}\u201D`}>
          Try a shorter word
          {mainOfficePhone ? `, or call the main office at ${mainOfficePhone}` : ''}.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {results.map((g) => {
            const open = q.length > 0 || openIds.has(g.id);
            return (
              <section key={g.id}>
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-expanded={open}
                  className="tap flex w-full items-center gap-3 rounded-card px-1 text-left"
                >
                  <SectionTitle className="flex-1">{g.title}</SectionTitle>
                  <span className="text-xs text-[var(--muted)]">{g.entries.length}</span>
                  <ChevronRight
                    className={cx(
                      'h-5 w-5 shrink-0 text-[var(--muted)] transition-transform',
                      open && 'rotate-90',
                    )}
                  />
                </button>
                {open && (
                  <div className="mt-2 space-y-2">
                    {g.entries.map((e) => (
                      <EntryCard key={e.id} entry={e} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {carded.mainOffice && (
        <section className="space-y-2">
          <SectionTitle>The school</SectionTitle>
          <Card className="p-4">
            {carded.mainOffice.note && (
              <p className="text-sm text-[var(--text)]">
                <LinkText>{carded.mainOffice.note}</LinkText>
              </p>
            )}
            <div className="mt-3 divide-y divide-[var(--divider)]">
              {(carded.mainOffice.contacts ?? []).map((c) => (
                <ContactRow key={c.id} c={c} />
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
