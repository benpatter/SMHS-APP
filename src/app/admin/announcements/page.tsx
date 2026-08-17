'use client';

import { useState } from 'react';
import { effectiveAnnouncements, useAppStore } from '@/lib/store';
import type { Announcement } from '@/config/announcements.seed';
import { nowInSchoolTz } from '@/lib/time';
import { formatRelative } from '@/lib/time';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, Field, Pill, SectionTitle, Select, TextArea, TextInput } from '@/components/ui';

type Audience = 'all' | '9' | '10' | '11' | '12';

function channelFor(aud: Audience): { audience: number | null; channel: string } {
  if (aud === 'all') return { audience: null, channel: 'All-School' };
  return { audience: Number(aud), channel: `Campus Life ${aud}` };
}

/** The stored audience (null = all-school) back to the picker's value. */
function audienceOf(a: Announcement): Audience {
  return a.audience === null ? 'all' : (String(a.audience) as Audience);
}

/**
 * The announcement fields, used for both posting a new one and editing one in
 * place. `announcement` null = the add form; otherwise the row's inline editor,
 * saving through updateAnnouncement so the id (and its postedAt) stay put.
 */
function AnnouncementForm({
  announcement,
  onDone,
}: {
  announcement?: Announcement;
  onDone?: () => void;
}) {
  const addAnnouncement = useAppStore((s) => s.addAnnouncement);
  const updateAnnouncement = useAppStore((s) => s.updateAnnouncement);
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [author, setAuthor] = useState(announcement?.author ?? '');
  const [aud, setAud] = useState<Audience>(announcement ? audienceOf(announcement) : 'all');

  const canPost = title.trim() && body.trim();

  const save = () => {
    const { audience, channel } = channelFor(aud);
    const fields = {
      title: title.trim(),
      body: body.trim(),
      audience,
      channel,
      author: author.trim() || 'Administration',
    };
    if (announcement) {
      updateAnnouncement(announcement.id, fields);
      onDone?.();
      return;
    }
    addAnnouncement({ ...fields, postedAt: nowInSchoolTz().toISO() ?? '' });
    setTitle('');
    setBody('');
    setAuthor('');
    setAud('all');
  };

  const fields = (
    <>
      <Field label="Title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spirit Week is here" />
      </Field>
      <Field label="Body">
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details students need to know…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Audience">
          <Select value={aud} onChange={(e) => setAud(e.target.value as Audience)}>
            <option value="all">All-School</option>
            <option value="9">Grade 9</option>
            <option value="10">Grade 10</option>
            <option value="11">Grade 11</option>
            <option value="12">Grade 12</option>
          </Select>
        </Field>
        <Field label="Posted by">
          <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Office of Campus Life" />
        </Field>
      </div>
    </>
  );

  if (announcement) {
    return (
      <div className="space-y-3 border-t border-[var(--divider)] bg-black/[0.02] px-4 py-4 dark:bg-white/[0.02]">
        {fields}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" disabled={!canPost} onClick={save}>
            Save changes
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <SectionTitle>New announcement</SectionTitle>
      <Card className="space-y-3 p-4">
        {fields}
        <Button className="w-full" disabled={!canPost} onClick={save}>
          Post announcement
        </Button>
      </Card>
    </section>
  );
}

function ManageRow({
  a,
  editing,
  onToggleEdit,
}: {
  a: Announcement;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const deleteAnnouncement = useAppStore((s) => s.deleteAnnouncement);
  const setHidden = useAppStore((s) => s.setAnnouncementHidden);
  const hidden = Boolean(a.hidden);

  return (
    <div>
      <div className={cxRow(hidden)}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Pill tone={a.audience === null ? 'royal' : 'gold'}>{a.channel}</Pill>
            {hidden && <Pill tone="muted">Hidden</Pill>}
          </div>
          <div className="mt-1 truncate font-semibold text-[var(--text)]">{a.title}</div>
          <div className="truncate text-xs text-[var(--muted)]">
            {a.author} · {formatRelative(a.postedAt)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button variant="outline" size="sm" onClick={onToggleEdit}>
            {editing ? 'Close' : 'Edit'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHidden(a.id, !hidden)}
          >
            {hidden ? 'Restore' : 'Hide'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => deleteAnnouncement(a.id)}>
            Delete
          </Button>
        </div>
      </div>
      {editing && <AnnouncementForm announcement={a} onDone={onToggleEdit} />}
    </div>
  );
}

function cxRow(hidden: boolean): string {
  return `flex items-start gap-3 px-4 py-3 ${hidden ? 'opacity-60' : ''}`;
}

export default function AdminAnnouncementsPage() {
  const serverData = useAppStore((s) => s.serverData);
  const admin = useAppStore((s) => s.admin);
  const anns = effectiveAnnouncements(serverData, admin, null, { includeHidden: true });
  // One inline editor open at a time.
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <AdminGate title="Announcements">
      <AnnouncementForm />

      {anns.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Posted announcements</SectionTitle>
          <Card className="divide-y divide-[var(--divider)]">
            {anns.map((a) => (
              <ManageRow
                key={a.id}
                a={a}
                editing={editingId === a.id}
                onToggleEdit={() => setEditingId(editingId === a.id ? null : a.id)}
              />
            ))}
          </Card>
        </section>
      )}
    </AdminGate>
  );
}
