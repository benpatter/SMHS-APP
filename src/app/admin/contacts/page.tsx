'use client';

import { useState } from 'react';
import { effectiveContacts, useAppStore } from '@/lib/store';
import type { Contact, ContactEntry, ContactGroup } from '@/config/contacts';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, Field, Pill, SectionTitle, TextArea, TextInput, cx } from '@/components/ui';
import { PlusIcon, TrashIcon } from '@/components/icons';

/**
 * The contact directory editor. Staff turn over and extensions change, so the
 * school maintains "who do I contact" here rather than waiting on a release.
 * The list is server-owned: an edit here is what every device shows on
 * More → Contacts. The bundled seed (config/contacts.ts, transcribed from
 * smhs.org) is only what a device starts from before the first publish.
 *
 * A topic is edited whole — its text and the people under it together — because
 * that's how it reads on the page; a field-at-a-time editor would be busywork.
 */

/** Draft people rows carry a local id so React keys survive reordering. */
type DraftContact = Contact;

let draftSeq = 0;
function blankPerson(): DraftContact {
  draftSeq += 1;
  return { id: `draft-${draftSeq}-${Math.round(performance.now())}`, name: '' };
}

/** Multi-line fields (steps, handled topics, keywords) are one item per line. */
function toLines(v: string): string[] | undefined {
  const lines = v
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

function PersonFields({
  person,
  onChange,
  onRemove,
}: {
  person: DraftContact;
  onChange: (patch: Partial<DraftContact>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 py-3 first:pt-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Name or office">
            <TextInput
              value={person.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Roza McCartan"
            />
          </Field>
        </div>
        <Button
          variant="danger"
          className="mt-5 shrink-0 px-3"
          aria-label={`Remove ${person.name || 'this person'}`}
          onClick={onRemove}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
      <Field label="Title (optional)">
        <TextInput
          value={person.role ?? ''}
          onChange={(e) => onChange({ role: e.target.value })}
          placeholder="Registrar"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone (optional)">
          <TextInput
            value={person.phone ?? ''}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="949-766-6090"
          />
        </Field>
        <Field label="Extension (optional)">
          <TextInput
            value={person.ext ?? ''}
            onChange={(e) => onChange({ ext: e.target.value })}
            placeholder="1082"
          />
        </Field>
      </div>
      <Field label="Email (optional)">
        <TextInput
          type="email"
          value={person.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="mccartanr@smhs.org"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Link (optional)">
          <TextInput
            value={person.url ?? ''}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://www.smhs.org/…"
          />
        </Field>
        <Field label="Link button text">
          <TextInput
            value={person.urlLabel ?? ''}
            onChange={(e) => onChange({ urlLabel: e.target.value })}
            placeholder="Open the Wellness page"
          />
        </Field>
      </div>
    </div>
  );
}

/** Add or edit one topic. `entry` null = a new topic in `groupId`. */
function EntryForm({
  groupId,
  entry,
  onDone,
}: {
  groupId: string;
  entry: ContactEntry | null;
  onDone: () => void;
}) {
  const addContactEntry = useAppStore((s) => s.addContactEntry);
  const updateContactEntry = useAppStore((s) => s.updateContactEntry);

  const [topic, setTopic] = useState(entry?.topic ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [steps, setSteps] = useState((entry?.steps ?? []).join('\n'));
  const [handles, setHandles] = useState((entry?.handles ?? []).join('\n'));
  const [keywords, setKeywords] = useState((entry?.keywords ?? []).join('\n'));
  const [people, setPeople] = useState<DraftContact[]>(entry?.contacts ?? []);

  const save = () => {
    const patch = {
      topic: topic.trim(),
      note: note.trim() || undefined,
      steps: toLines(steps),
      handles: toLines(handles),
      keywords: toLines(keywords),
      contacts: people
        .filter((p) => p.name.trim())
        .map((p) => ({
          id: p.id,
          name: p.name.trim(),
          role: p.role?.trim() || undefined,
          email: p.email?.trim() || undefined,
          phone: p.phone?.trim() || undefined,
          ext: p.ext?.trim() || undefined,
          url: p.url?.trim() || undefined,
          urlLabel: p.urlLabel?.trim() || undefined,
        })),
    };
    if (entry) updateContactEntry(entry.id, patch);
    else addContactEntry(groupId, patch);
    onDone();
  };

  return (
    <Card className="space-y-3 p-4">
      <Field label="Topic" hint="What someone is trying to do, in their words.">
        <TextInput
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Concern about a teacher or a class"
        />
      </Field>
      <Field label="What to do (optional)">
        <TextArea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ask the head coach of the team."
        />
      </Field>
      <Field label="Steps, one per line (optional)" hint="Numbered on the page, in order.">
        <TextArea
          rows={3}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder={'Talk to the teacher first.\nNot resolved? Email the department chair.'}
        />
      </Field>
      <Field label="This office handles, one per line (optional)">
        <TextArea
          rows={3}
          value={handles}
          onChange={(e) => setHandles(e.target.value)}
          placeholder={'Dress code\nDetentions\nParking permits'}
        />
      </Field>
      <Field
        label="Search words, one per line (optional)"
        hint="Hidden on the page; they just help the search find this topic."
      >
        <TextArea
          rows={2}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={'tardy\nlate'}
        />
      </Field>

      <div>
        <SectionTitle>Who to reach</SectionTitle>
        <div className="divide-y divide-[var(--divider)]">
          {people.map((p, i) => (
            <PersonFields
              key={p.id}
              person={p}
              onChange={(patch) =>
                setPeople((prev) => prev.map((x, j) => (i === j ? { ...x, ...patch } : x)))
              }
              onRemove={() => setPeople((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => setPeople((prev) => [...prev, blankPerson()])}
        >
          <PlusIcon className="h-4 w-4" /> Add a person or office
        </Button>
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="flex-1" disabled={!topic.trim()} onClick={save}>
          {entry ? 'Save changes' : 'Add topic'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function EntryRow({
  entry,
  onEdit,
}: {
  entry: ContactEntry;
  onEdit: () => void;
}) {
  const deleteContactEntry = useAppStore((s) => s.deleteContactEntry);
  const setHidden = useAppStore((s) => s.setContactEntryHidden);
  const [confirming, setConfirming] = useState(false);
  const people = entry.contacts ?? [];
  const hidden = Boolean(entry.hidden);

  return (
    <div className={cx('px-4 py-3', hidden && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text)]">{entry.topic}</span>
            {hidden && <Pill tone="muted">Hidden</Pill>}
          </div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">
            {people.length > 0
              ? people.map((p) => p.name).join(', ')
              : entry.note
                ? entry.note
                : 'No one listed'}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHidden(entry.id, !hidden)}
          >
            {hidden ? 'Restore' : 'Hide'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => (confirming ? deleteContactEntry(entry.id) : setConfirming(true))}
          >
            {confirming ? 'Sure?' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupSection({
  group,
  editingId,
  setEditingId,
}: {
  group: ContactGroup;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const renameContactGroup = useAppStore((s) => s.renameContactGroup);
  const deleteContactGroup = useAppStore((s) => s.deleteContactGroup);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [confirming, setConfirming] = useState(false);
  const addingId = `new:${group.id}`;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        {renaming ? (
          <>
            <TextInput
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-0 flex-1"
            />
            <Button
              size="sm"
              disabled={!title.trim()}
              onClick={() => {
                renameContactGroup(group.id, title);
                setRenaming(false);
              }}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTitle(group.title);
                setRenaming(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <SectionTitle className="flex-1">{group.title}</SectionTitle>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => (confirming ? deleteContactGroup(group.id) : setConfirming(true))}
            >
              {confirming ? `Delete ${group.entries.length} topics?` : 'Delete'}
            </Button>
          </>
        )}
      </div>

      {group.entries.length > 0 && (
        <Card className="divide-y divide-[var(--divider)]">
          {group.entries.map((e) =>
            editingId === e.id ? (
              <div key={e.id} className="p-2">
                <EntryForm groupId={group.id} entry={e} onDone={() => setEditingId(null)} />
              </div>
            ) : (
              <EntryRow key={e.id} entry={e} onEdit={() => setEditingId(e.id)} />
            ),
          )}
        </Card>
      )}

      {editingId === addingId ? (
        <EntryForm groupId={group.id} entry={null} onDone={() => setEditingId(null)} />
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setEditingId(addingId)}>
          <PlusIcon className="h-4 w-4" /> Add a topic to {group.title}
        </Button>
      )}
    </section>
  );
}

function AddGroupForm() {
  const addContactGroup = useAppStore((s) => s.addContactGroup);
  const [title, setTitle] = useState('');
  return (
    <Card className="space-y-3 p-4">
      <Field label="New category">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Transportation"
        />
      </Field>
      <Button
        className="w-full"
        disabled={!title.trim()}
        onClick={() => {
          addContactGroup(title);
          setTitle('');
        }}
      >
        Add category
      </Button>
    </Card>
  );
}

export default function AdminContactsPage() {
  const groups = useAppStore((s) => effectiveContacts(s.serverData));
  // One editor open at a time: an entry id, or `new:<groupId>` for an addition.
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <AdminGate title="Contacts">
      <p className="text-sm text-[var(--muted)]">
        The who-to-contact directory students and parents see on More → Contacts. Names, numbers,
        and extensions change every year, so keep them current here.
      </p>

      {groups.map((g) => (
        <GroupSection key={g.id} group={g} editingId={editingId} setEditingId={setEditingId} />
      ))}

      <AddGroupForm />
    </AdminGate>
  );
}
