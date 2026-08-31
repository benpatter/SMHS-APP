'use client';

import { useState } from 'react';
import { effectiveDining, effectiveDiningItems, useAppStore } from '@/lib/store';
import { MENU_SECTIONS, type MenuItem, type MenuSection } from '@/config/dining.seed';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, Field, Pill, SectionTitle, Select, TextArea, TextInput, cx } from '@/components/ui';

/**
 * Campus Dining editor: the vendor's menu, prices, and hours change over time,
 * so the school maintains them here: edit any item (built-in or added), hide
 * items that are gone, add new ones, and override hours/contact. Everything
 * students see on More → Campus Dining reflects this immediately.
 */

function AddItemForm() {
  const addDiningItem = useAppStore((s) => s.addDiningItem);
  const [section, setSection] = useState<MenuSection>('lunch');
  const [group, setGroup] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  return (
    <section className="space-y-2">
      <SectionTitle>New menu item</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Menu">
            <Select value={section} onChange={(e) => setSection(e.target.value as MenuSection)}>
              {MENU_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Board group">
            <TextInput
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Hot Items"
            />
          </Field>
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Carne Asada Fries" />
          </Field>
          <Field label="Price">
            <TextInput value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$9.50" />
          </Field>
        </div>
        <Field label="Ingredients (optional)">
          <TextArea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="fries, carne asada, cheese, guacamole…"
          />
        </Field>
        <Button
          className="w-full"
          disabled={!name.trim() || !price.trim() || !group.trim()}
          onClick={() => {
            addDiningItem({
              section,
              group: group.trim(),
              name: name.trim(),
              price: price.trim(),
              description: description.trim() || undefined,
            });
            setName('');
            setPrice('');
            setDescription('');
          }}
        >
          Add to the menu
        </Button>
      </Card>
    </section>
  );
}

function ItemRow({ item }: { item: MenuItem }) {
  const updateDiningItem = useAppStore((s) => s.updateDiningItem);
  const deleteDiningItem = useAppStore((s) => s.deleteDiningItem);
  const setHidden = useAppStore((s) => s.setDiningItemHidden);
  const hidden = Boolean(item.hidden);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [description, setDescription] = useState(item.description ?? '');

  return (
    <div className={cx('px-4 py-3', hidden && 'opacity-50')}>
      {!editing ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--text)]">{item.name}</span>
              <span className="tnum text-sm font-bold text-royal dark:text-gold">{item.price}</span>
              {hidden && <Pill tone="muted">Hidden</Pill>}
            </div>
            {item.description && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">{item.description}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="outline"
              className="px-2.5 py-1.5 text-xs"
              onClick={() => {
                setName(item.name);
                setPrice(item.price);
                setDescription(item.description ?? '');
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              className="px-2.5 py-1.5 text-xs"
              onClick={() => setHidden(item.id, !hidden)}
            >
              {hidden ? 'Restore' : 'Hide'}
            </Button>
            <Button
              variant="danger"
              className="px-2.5 py-1.5 text-xs"
              onClick={() => deleteDiningItem(item.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-[1fr_6rem] gap-2.5">
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Price">
              <TextInput value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
          <Field label="Ingredients">
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              className="flex-1 py-2 text-xs"
              disabled={!name.trim() || !price.trim()}
              onClick={() => {
                updateDiningItem(item.id, {
                  name: name.trim(),
                  price: price.trim(),
                  description: description.trim() || undefined,
                });
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" className="py-2 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoOverrides() {
  const dining = useAppStore((s) => effectiveDining(s.serverData, s.admin));
  const setDiningOverride = useAppStore((s) => s.setDiningOverride);
  const [hours, setHours] = useState(dining.hours ?? '');
  const [contact, setContact] = useState(dining.contact ?? '');

  return (
    <section className="space-y-2">
      <SectionTitle>Hours &amp; contact</SectionTitle>
      <Card className="space-y-3 p-4">
        <Field
          label="Hours"
          hint="Blank = the live smhs.org hours, or 7:00 AM – 3:00 PM when the site can't be reached."
        >
          <TextInput
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="7:00 AM – 3:00 PM"
          />
        </Field>
        <Field label="Contact email" hint="Blank = use the live smhs.org contact.">
          <TextInput
            type="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="foodservices@smhs.org"
          />
        </Field>
        <Button
          className="w-full"
          onClick={() =>
            setDiningOverride({ hours: hours.trim() || undefined, contact: contact.trim() || undefined })
          }
        >
          Save overrides
        </Button>
      </Card>
    </section>
  );
}

export default function AdminDiningPage() {
  const serverData = useAppStore((s) => s.serverData);
  const admin = useAppStore((s) => s.admin);
  // Hidden items stay visible here (greyed out) so they can be restored.
  const all = effectiveDiningItems(serverData, admin, { includeHidden: true });

  return (
    <AdminGate title="Campus Dining">
      <p className="text-sm text-[var(--muted)]">
        Hanna&apos;s changes the menu and prices, so keep the student menu current here. Edits show
        up on More → Campus Dining.
      </p>

      <AddItemForm />
      <InfoOverrides />

      {MENU_SECTIONS.map((s) => {
        const items = all.filter((i) => i.section === s.id);
        if (items.length === 0) return null;
        return (
          <section key={s.id} className="space-y-2">
            <SectionTitle>
              {s.label}
              {s.note ? ` · ${s.note}` : ''}
            </SectionTitle>
            <Card className="divide-y divide-[var(--divider)]">
              {items.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </Card>
          </section>
        );
      })}
    </AdminGate>
  );
}
