'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { BackLink } from '@/components/BackLink';
import { Button, Card, Field, LinkButton, Select, TextInput, cx } from '@/components/ui';
import { PencilIcon, TrashIcon, CheckIcon, ShareIcon } from '@/components/icons';
import type { LunchTrack, PersonalClass } from '@/lib/types';
import { BUILDINGS, lunchForBuilding, lunchLabel } from '@/config/buildings';

/** The lunch a class eats: derived from the building, or picked by hand. */
const LUNCH_CHOICES: { value: 'auto' | LunchTrack; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'first', label: '1st Lunch (or science class)' },
  { value: 'second', label: '2nd Lunch' },
];

/**
 * What "Auto" works out to for a building: "Auto: 1st Lunch". Null when there
 * is no building to resolve, since then Auto really is just Auto.
 */
function autoLunchLabel(building?: string | null): string | null {
  const track = lunchForBuilding(building);
  return track ? `Auto: ${lunchLabel(track)}` : null;
}

function PeriodEditor({
  n,
  initial,
  allowFree,
  onSave,
  onCancel,
}: {
  n: number;
  initial: PersonalClass;
  /** Students have no free periods (so neither do parents); teachers do. */
  allowFree: boolean;
  onSave: (p: PersonalClass) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PersonalClass>(initial);
  // Auto follows the building, so name the lunch it lands on rather than making
  // the student cross-reference the chart to find out.
  const autoLabel = autoLunchLabel(draft.building) ?? 'Auto';

  return (
    <div className="space-y-3 border-t border-[var(--divider)] bg-black/[0.02] px-4 py-4 dark:bg-white/[0.02]">
      <Field label="Class name">
        <TextInput
          autoFocus
          value={draft.name ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={`Period ${n}`}
          disabled={draft.free}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Room">
          <TextInput
            value={draft.room ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))}
            placeholder="e.g. 215"
            disabled={draft.free}
          />
        </Field>
        <Field label="Building">
          <Select
            value={draft.building ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, building: e.target.value }))}
            disabled={draft.free}
          >
            <option value="">-</option>
            {BUILDINGS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Teacher">
        <TextInput
          value={draft.teacher ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, teacher: e.target.value }))}
          placeholder="Optional"
          disabled={draft.free}
        />
      </Field>

      {/* Lunch as a pick-one list: three rows a thumb can hit, with the
          science case named on the option instead of in a second control.
          Hidden on a free period, which decides no lunch. */}
      {!draft.free && (
        <fieldset>
          <legend className="text-xs font-semibold text-[var(--muted)]">Lunch</legend>
          <div className="mt-1 divide-y divide-[var(--divider)] overflow-hidden rounded-card border border-[var(--divider)]">
            {LUNCH_CHOICES.map((c) => (
              <label key={c.value} className="tap flex items-center gap-3 px-3 py-2">
                <input
                  type="radio"
                  name={`lunch-${n}`}
                  value={c.value}
                  checked={(draft.lunch ?? 'auto') === c.value}
                  onChange={() =>
                    setDraft((d) => ({ ...d, lunch: c.value === 'auto' ? undefined : c.value }))
                  }
                  className="h-5 w-5 shrink-0 accent-[var(--royal)]"
                />
                <span className="text-sm text-[var(--text)]">
                  {c.value === 'auto' ? autoLabel : c.label}
                </span>
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs text-[var(--muted)]">
            Auto follows your building. Change it only if this class is an exception.
          </span>
        </fieldset>
      )}

      {allowFree && (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={!!draft.free}
            onChange={(e) => setDraft((d) => ({ ...d, free: e.target.checked }))}
            className="h-5 w-5 accent-[var(--royal)]"
          />
          <span className="text-sm text-[var(--text)]">
            Free period / off: the countdown treats this as free time
          </span>
        </label>
      )}

      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={() => onSave({ ...draft, science: undefined })}>
          <CheckIcon className="h-4 w-4" /> Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const mounted = useMounted();
  const schedule = useAppStore((s) => s.schedule);
  const setClass = useAppStore((s) => s.setClass);
  const clearClass = useAppStore((s) => s.clearClass);
  // Parents build their child's schedule here; teachers build the classes
  // they teach. Sharing is a student thing.
  const parent = useAppStore((s) => s.userRole === 'parent') && mounted;
  const staff = useAppStore((s) => s.userRole === 'staff') && mounted;
  const [editing, setEditing] = useState<number | null>(null);

  const periods = Array.from({ length: 7 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">My Schedule</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {staff ? 'Add the classes you teach.' : 'Add your classes.'}
        </p>
      </div>

      <Card className="divide-y divide-[var(--divider)] overflow-hidden">
        {periods.map((n) => {
          const pc = (mounted && schedule[n]) || {};
          const filled = !!(pc.name || pc.room || pc.teacher || pc.free || pc.science || pc.lunch);
          const isEditing = editing === n;
          return (
            <div key={n}>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-royal/10 text-sm font-bold text-royal dark:bg-white/5 dark:text-gold">
                  {n}
                </span>
                <div className="min-w-0 flex-1">
                  {pc.free ? (
                    <div className="font-semibold text-[var(--muted)]">Free Period</div>
                  ) : (
                    <div
                      className={cx(
                        'truncate font-semibold',
                        filled ? 'text-[var(--text)]' : 'text-[var(--muted)]',
                      )}
                    >
                      {pc.name ? `Period ${n} · ${pc.name}` : `Period ${n}`}
                    </div>
                  )}
                  {(pc.room || pc.building || pc.teacher || pc.lunch) && !pc.free && (
                    <div className="truncate text-xs text-[var(--muted)]">
                      {[
                        [pc.building, pc.room].filter(Boolean).join(' '),
                        pc.teacher,
                        // The lunch this period eats: the hand-set pick when
                        // there is one, otherwise whatever the building works
                        // out to, marked Auto so it is clear nobody chose it.
                        pc.lunch ? lunchLabel(pc.lunch) : autoLunchLabel(pc.building),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                  {!filled && <div className="text-xs text-[var(--muted)]">Tap to add</div>}
                </div>
                <button
                  onClick={() => setEditing(isEditing ? null : n)}
                  aria-label={`Edit block ${n}`}
                  className="tap flex items-center justify-center text-[var(--muted)] hover:text-brand"
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
                {filled && (
                  <button
                    onClick={() => {
                      clearClass(n);
                      if (isEditing) setEditing(null);
                    }}
                    aria-label={`Clear block ${n}`}
                    className="tap flex items-center justify-center text-[var(--muted)] hover:text-danger"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
              {isEditing && (
                <PeriodEditor
                  n={n}
                  initial={pc}
                  allowFree={staff}
                  onSave={(p) => {
                    setClass(n, p);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          );
        })}
      </Card>

      {!parent && !staff && (
        <LinkButton href="/more/share/" variant="gold" className="w-full py-3">
          <ShareIcon className="h-5 w-5" /> Share My Schedule
        </LinkButton>
      )}
    </div>
  );
}
