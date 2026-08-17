'use client';

import { useMemo, useRef, useState } from 'react';
import type { StaffMember } from '@/lib/providers/staff';
import { matchStaff } from '@/lib/providers/staff';
import { Field, Select, TextInput, cx } from './ui';

/**
 * Pick a staff member from the school directory: a Department dropdown (for
 * convenience, it narrows the list) plus a name box that suggests matches as you
 * type. Tapping a suggestion fills the box and reports the selection.
 *
 * Used by the Admin/Teacher portal sign-in (pick who you are).
 */
export function StaffPicker({
  staff,
  departments,
  label = 'Teacher',
  placeholder = 'Type a name…',
  selected,
  onSelect,
  onQueryChange,
}: {
  /** Candidates to search (already restricted for the admin portal). */
  staff: StaffMember[];
  /** Department names for the dropdown; selecting one narrows suggestions. */
  departments: string[];
  label?: string;
  placeholder?: string;
  selected: StaffMember | null;
  onSelect: (member: StaffMember | null) => void;
  /** Reports the raw typed text, for callers that accept free-text names too. */
  onQueryChange?: (query: string) => void;
}) {
  const [query, setQuery] = useState(selected?.name ?? '');
  const [department, setDepartment] = useState<string>('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  const suggestions = useMemo(
    () => matchStaff(staff, query, department || null).slice(0, 8),
    [staff, query, department],
  );

  const pick = (m: StaffMember) => {
    setQuery(m.name);
    onQueryChange?.(m.name);
    setOpen(false);
    onSelect(m);
  };

  return (
    <div className="space-y-3">
      <Field label="Department" hint="Optional. Narrows the list below.">
        <Select
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            // A department change can invalidate the picked person.
            if (selected && e.target.value && !selected.departments.includes(e.target.value)) {
              setQuery('');
              onSelect(null);
            }
          }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>

      <div className="relative">
        <Field label={label}>
          <TextInput
            value={query}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              onQueryChange?.(e.target.value);
              setOpen(true);
              if (selected) onSelect(null); // typing again un-picks
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Delay so a tap on a suggestion lands before the list closes.
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            aria-expanded={open}
            aria-autocomplete="list"
          />
        </Field>
        {open && suggestions.length > 0 && !selected && (
          <ul
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-card border border-[var(--divider)] bg-[var(--surface)] shadow-lg"
            onMouseDown={() => clearTimeout(blurTimer.current)}
          >
            {suggestions.map((m) => (
              <li key={m.email || m.name}>
                <button
                  type="button"
                  onClick={() => pick(m)}
                  className="tap block w-full px-3 py-2.5 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                >
                  <span className="block font-semibold text-[var(--text)]">{m.name}</span>
                  {m.title && (
                    <span className="block truncate text-xs text-[var(--muted)]">{m.title}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && query.trim() && suggestions.length === 0 && !selected && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            No {department ? `${department} ` : ''}staff match &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
      </div>

      {selected && (
        <p className={cx('text-xs text-[var(--muted)]')}>
          Selected: <span className="font-semibold text-[var(--text)]">{selected.name}</span>
          {selected.title ? ` · ${selected.title}` : ''}
        </p>
      )}
    </div>
  );
}
