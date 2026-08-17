'use client';

import { useMemo, useRef, useState } from 'react';
import { effectivePrayers, useAppStore } from '@/lib/store';
import type { Prayer } from '@/config/prayers.seed';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, Field, SectionTitle, TextArea, TextInput, cx } from '@/components/ui';
import { GripIcon } from '@/components/icons';

/**
 * The prayer book editor. Prayers are server-owned (every device shares one
 * list); the bundled seed is only what a fresh device starts from. Editing a
 * prayer loads it into the form; saving replaces it in place. Rows reorder by
 * dragging the grip handle (pointer events, so it works with touch too) and
 * the new order persists for everyone.
 */
function PrayerForm({
  editing,
  onDone,
}: {
  editing: Prayer | null;
  onDone: () => void;
}) {
  const addPrayer = useAppStore((s) => s.addPrayer);
  const updatePrayer = useAppStore((s) => s.updatePrayer);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [text, setText] = useState(editing?.text ?? '');

  return (
    <Card className="space-y-3 p-4">
      <Field label="Title">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Prayer Before Class"
        />
      </Field>
      <Field label="Text">
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'Line by line, exactly as it should read.\n\nAmen.'}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!title.trim() || !text.trim()}
          onClick={() => {
            if (editing) updatePrayer(editing.id, { title: title.trim(), text: text.trim() });
            else addPrayer({ title: title.trim(), text: text.trim() });
            setTitle('');
            setText('');
            onDone();
          }}
        >
          {editing ? 'Save changes' : 'Add prayer'}
        </Button>
        {editing && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}

interface DragState {
  id: string;
  from: number;
  to: number;
  startY: number;
  rowH: number;
}

export default function AdminFaithPage() {
  const prayers = useAppStore((s) => effectivePrayers(s.serverData, { includeHidden: true }));
  const updatePrayer = useAppStore((s) => s.updatePrayer);
  const deletePrayer = useAppStore((s) => s.deletePrayer);
  const reorderPrayers = useAppStore((s) => s.reorderPrayers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = prayers.find((p) => p.id === editingId) ?? null;

  // Drag-to-reorder: the ref is the live drag, the state mirror re-renders the
  // preview order. Row heights are uniform (one-line rows), so the target slot
  // is just the pointer's travel divided by the grabbed row's height.
  const drag = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<{ id: string; to: number } | null>(null);

  const displayed = useMemo(() => {
    if (!preview) return prayers;
    const from = prayers.findIndex((p) => p.id === preview.id);
    if (from < 0) return prayers;
    const next = [...prayers];
    const [moved] = next.splice(from, 1);
    next.splice(preview.to, 0, moved);
    return next;
  }, [prayers, preview]);

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    const row = e.currentTarget.closest('[data-prayer-row]') as HTMLElement | null;
    const from = prayers.findIndex((p) => p.id === id);
    if (from < 0) return;
    drag.current = { id, from, to: from, startY: e.clientY, rowH: row?.offsetHeight || 60 };
    setPreview({ id, to: from });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = drag.current;
    if (!s) return;
    const delta = Math.round((e.clientY - s.startY) / s.rowH);
    const to = Math.min(prayers.length - 1, Math.max(0, s.from + delta));
    if (to !== s.to) {
      s.to = to;
      setPreview({ id: s.id, to });
    }
  };

  const endDrag = () => {
    const s = drag.current;
    drag.current = null;
    setPreview(null);
    if (!s || s.to === s.from) return;
    const next = [...prayers];
    const [moved] = next.splice(s.from, 1);
    next.splice(s.to, 0, moved);
    reorderPrayers(next.map((p) => p.id));
  };

  return (
    <AdminGate title="Faith">
      <section className="space-y-2">
        <SectionTitle>{editing ? `Editing: ${editing.title}` : 'New prayer'}</SectionTitle>
        {/* Key remounts the form when a different prayer is picked for editing. */}
        <PrayerForm key={editingId ?? 'new'} editing={editing} onDone={() => setEditingId(null)} />
      </section>

      <section className="space-y-2">
        <SectionTitle>Prayer book</SectionTitle>
        <Card className={cx('divide-y divide-[var(--divider)]', preview && 'select-none')}>
          {displayed.map((p) => {
            const dragging = preview?.id === p.id;
            return (
              <div
                key={p.id}
                data-prayer-row
                className={cx(
                  'flex items-center gap-2 px-3 py-3',
                  p.hidden && 'opacity-60',
                  dragging && 'relative z-10 bg-gold/10 shadow-md',
                )}
              >
                <button
                  onPointerDown={(e) => startDrag(e, p.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  aria-label={`Reorder ${p.title}`}
                  className="tap flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--muted)]/60 active:cursor-grabbing"
                >
                  <GripIcon className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-[var(--text)]">{p.title}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {p.hidden ? 'Hidden · ' : ''}
                    {p.text.split('\n')[0]}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm" className="shrink-0"
                  onClick={() => setEditingId(p.id)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm" className="shrink-0"
                  onClick={() => updatePrayer(p.id, { hidden: !p.hidden })}
                >
                  {p.hidden ? 'Show' : 'Hide'}
                </Button>
                <Button
                  variant="danger"
                  size="sm" className="shrink-0"
                  onClick={() => {
                    if (editingId === p.id) setEditingId(null);
                    deletePrayer(p.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            );
          })}
        </Card>
      </section>
    </AdminGate>
  );
}
