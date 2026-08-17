'use client';

import { useState } from 'react';
import { effectiveNotices, useAppStore, type PageNotice } from '@/lib/store';
import { NOTICE_PAGES, noticePageLabel } from '@/config/noticePages';
import { bannerToneClass } from '@/components/AlertBanner';
import { noticeCardClass } from '@/components/PageNotices';
import { IconTile } from '@/components/QuickActions';
import { Button, Card, Field, Pill, SectionTitle, Select, TextArea, TextInput, cx } from '@/components/ui';
import {
  MegaphoneIcon,
  CalendarIcon,
  BellIcon,
  CrossIcon,
  UtensilsIcon,
  UsersIcon,
  SchoolIcon,
  PinIcon,
  PhoneIcon,
  ChartIcon,
  ShieldIcon,
} from '@/components/icons';

/**
 * The admin dashboard's building blocks, shared by the classic /admin/ console
 * and the Admin portal.
 */

type NoticeDraft = Omit<PageNotice, 'id'>;

const EMPTY_DRAFT: NoticeDraft = { page: '*', title: '', message: '', tone: 'info' };

/** Exactly how the notice will render: the banner strip or the page card. */
function NoticePreview({ draft }: { draft: NoticeDraft }) {
  if (!draft.message.trim()) {
    return <p className="text-sm text-[var(--muted)]">The preview appears as you type.</p>;
  }
  if (draft.page === '*') {
    return (
      <div
        className={cx(
          'rounded-card border px-4 py-2.5 text-sm font-semibold',
          bannerToneClass(draft.tone),
        )}
      >
        <div className="flex items-start gap-2">
          <span aria-hidden="true">⚠</span>
          <span className="min-w-0 flex-1">{draft.message}</span>
        </div>
      </div>
    );
  }
  return (
    <Card className={cx('p-4', noticeCardClass(draft.tone))}>
      {draft.title?.trim() && <h2 className="section-title">{draft.title}</h2>}
      <p className={cx('text-sm text-[var(--text)]', draft.title?.trim() && 'mt-2')}>
        {draft.message}
      </p>
    </Card>
  );
}

/**
 * Banner & page notices: one editor for the school-wide banner (an "Every
 * page" notice) and info boxes pinned to any single page, shown on all devices.
 */
export function NoticesEditor() {
  const serverData = useAppStore((s) => s.serverData);
  const admin = useAppStore((s) => s.admin);
  const addNotice = useAppStore((s) => s.addNotice);
  const updateNotice = useAppStore((s) => s.updateNotice);
  const deleteNotice = useAppStore((s) => s.deleteNotice);
  const notices = effectiveNotices(serverData, admin);

  /** null = form closed; '' = adding a new notice; otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoticeDraft>(EMPTY_DRAFT);
  const patch = (p: Partial<NoticeDraft>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    const clean: NoticeDraft = {
      page: draft.page,
      tone: draft.tone,
      title: draft.page === '*' ? undefined : draft.title?.trim() || undefined,
      message: draft.message.trim(),
    };
    if (editing) updateNotice(editing, clean);
    else addNotice(clean);
    setEditing(null);
  };

  return (
    <section className="space-y-2">
      <SectionTitle>Banner &amp; page notices</SectionTitle>
      <Card className="space-y-3 p-4">
        {notices.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing is posted right now.</p>
        ) : (
          notices.map((n) => (
            <div key={n.id} className="rounded-card border border-[var(--divider)] p-3">
              <Pill tone="muted">{noticePageLabel(n.page)}</Pill>
              {n.title?.trim() && (
                <p className="mt-1 font-semibold text-[var(--text)]">{n.title}</p>
              )}
              <p className="mt-1 line-clamp-2 text-sm text-[var(--text)]">{n.message}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm" className="flex-1"
                  onClick={() => {
                    setDraft({ page: n.page, title: n.title ?? '', message: n.message, tone: n.tone });
                    setEditing(n.id);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm" className="flex-1"
                  onClick={() => {
                    deleteNotice(n.id);
                    if (editing === n.id) setEditing(null);
                  }}
                >
                  Take down
                </Button>
              </div>
            </div>
          ))
        )}
        {editing === null && (
          <Button
            className="w-full"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setEditing('');
            }}
          >
            New notice
          </Button>
        )}
      </Card>

      {editing !== null && (
        <Card className="space-y-3 p-4">
          <NoticePreview draft={draft} />
          <Field label="Where it shows">
            <Select value={draft.page} onChange={(e) => patch({ page: e.target.value })}>
              <option value="*">Every page (banner under the header)</option>
              {NOTICE_PAGES.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.label} page
                </option>
              ))}
            </Select>
          </Field>
          {draft.page !== '*' && (
            <Field label="Title (optional)">
              <TextInput
                value={draft.title ?? ''}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="e.g. Club Rush"
              />
            </Field>
          )}
          <Field label="Message">
            <TextArea
              value={draft.message}
              onChange={(e) => patch({ message: e.target.value })}
              placeholder="e.g. Minimum day Friday, dismissal at 1:25 PM."
            />
          </Field>
          <Field label="Tone">
            <Select
              value={draft.tone}
              onChange={(e) => patch({ tone: e.target.value as PageNotice['tone'] })}
            >
              <option value="info">Blue (info)</option>
              <option value="gold">Gold (highlight)</option>
              <option value="urgent">Red (urgent)</option>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!draft.message.trim()} onClick={save}>
              {editing ? 'Save changes' : 'Post it'}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}

/**
 * The admin "Quick Access" grid — same icon-tile look as the student home.
 * Today's Schedule and the School-wide Banner are click-into pages now
 * (no more inline editors on the dashboard).
 */
export function ManageSection() {
  return (
    <section>
      <SectionTitle className="mb-2">Quick Access</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        <IconTile href="/admin/schedule/" Icon={CalendarIcon} label="Schedule" sub="Edit any day's blocks" />
        <IconTile href="/admin/banner/" Icon={MegaphoneIcon} label="Notices" sub="Banner & page boxes" />
        <IconTile href="/admin/announcements/" Icon={BellIcon} label="Posts" sub="Announcements" />
        <IconTile href="/admin/athletics/" Icon={UsersIcon} label="Athletics" sub="Edit upcoming games" />
        <IconTile href="/admin/faith/" Icon={CrossIcon} label="Faith" sub="Add and edit prayers" />
        <IconTile href="/admin/dining/" Icon={UtensilsIcon} label="Dining" sub="Menu, prices, hours" />
        <IconTile href="/admin/map/" Icon={PinIcon} label="Map" sub="Edit location pins" />
        <IconTile href="/admin/contacts/" Icon={PhoneIcon} label="Contacts" sub="Who to contact" />
        <IconTile href="/admin/school/" Icon={SchoolIcon} label="School" sub="Attendance line, Aeries link" />
        <IconTile href="/admin/metrics/" Icon={ChartIcon} label="Metrics" sub="Usage & support tickets" />
        <IconTile href="/admin/access/" Icon={ShieldIcon} label="Admins" sub="Grant admin logins" />
      </div>
    </section>
  );
}
