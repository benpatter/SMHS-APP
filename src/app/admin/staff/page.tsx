'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import { StaffPicker } from '@/components/StaffPicker';
import { Button, Card, Field, Pill, SectionTitle, Select, Spinner, TextInput } from '@/components/ui';
import {
  invalidateStaffDirectory,
  useStaffDirectory,
  type StaffMember,
} from '@/lib/providers/staff';
import {
  fetchStaffOverrides,
  removeStaffOverride,
  requestPasswordSetup,
  setStaffOverride,
  type StaffOverride,
} from '@/lib/portalAuth';

/**
 * Administration → Staff: add or correct staff accounts by hand.
 *
 * The portals identify staff from the smhs.org directory, and an account is
 * keyed by the email on that card. Plenty of cards carry none (coaches,
 * substitutes, security, aides), so the picker shows the name and then
 * refuses it: "the directory has no email for …". This page is the fix. An
 * admin types the address (the server merges it into the roster on the spot),
 * corrects a wrong one, or adds someone the directory doesn't list at all.
 * The account itself is the usual one: same portals, same emailed setup link.
 */
export default function AdminStaffPage() {
  return (
    <AdminGate title="Staff accounts">
      <StaffEditor />
    </AdminGate>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function StaffEditor() {
  const { directory, loading } = useStaffDirectory();

  // The hand-made rows. `undefined` = not asked yet, null = the server refused
  // or was unreachable (the list needs an admin session, unlike the roster).
  const [overrides, setOverrides] = useState<StaffOverride[] | null | undefined>(undefined);
  const reloadOverrides = useCallback(async () => setOverrides(await fetchStaffOverrides()), []);
  useEffect(() => {
    void reloadOverrides();
  }, [reloadOverrides]);

  // The form. `member` is a directory person being patched; with none, the
  // typed name is a new person. Remounting the picker (pickerKey) is how the
  // "Add email" buttons below hand it a selection.
  const [member, setMember] = useState<StaffMember | null>(null);
  const [query, setQuery] = useState('');
  const [pickerKey, setPickerKey] = useState(0);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ name: string; email: string } | null>(null);
  const [setup, setSetup] = useState<{ emailed: boolean; setupUrl?: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const name = member?.name ?? query.trim().replace(/\s+/g, ' ');
  const isNew = !member && name.length > 0;
  const emailOk = EMAIL_RE.test(email.trim());

  const choose = (m: StaffMember | null) => {
    setMember(m);
    setEmail(m?.email ?? '');
    setTitle(m?.title ?? '');
    setSaved(null);
    setSetup(null);
    setError('');
  };

  /** From the missing-email list: select the person and jump to the address box. */
  const fixEmail = (m: StaffMember) => {
    choose(m);
    setQuery(m.name);
    setPickerKey((k) => k + 1);
    setTimeout(() => emailRef.current?.focus(), 0);
  };

  const reset = () => {
    setMember(null);
    setQuery('');
    setEmail('');
    setTitle('');
    setDepartment('');
    setPickerKey((k) => k + 1);
  };

  const save = async () => {
    if (!name || !emailOk) return;
    setBusy(true);
    setError('');
    setSetup(null);
    const r = await setStaffOverride({
      name,
      email: email.trim(),
      title: title.trim(),
      departments: isNew && department ? [department] : [],
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'The change was not saved');
      return;
    }
    setSaved({ name, email: email.trim().toLowerCase() });
    reset();
    await Promise.all([invalidateStaffDirectory(), reloadOverrides()]);
  };

  const remove = async (row: StaffOverride) => {
    setError('');
    setSaved(null);
    const r = await removeStaffOverride(row.name);
    if (!r.ok) setError(r.error ?? 'The change was not saved');
    await Promise.all([invalidateStaffDirectory(), reloadOverrides()]);
  };

  /** Send the just-added person their password setup link, right from here. */
  const sendSetup = async () => {
    if (!saved) return;
    setBusy(true);
    const r = await requestPasswordSetup(saved.email);
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Could not send the setup link');
    else setSetup({ emailed: Boolean(r.emailed), setupUrl: r.setupUrl });
  };

  const missing = useMemo(() => (directory?.staff ?? []).filter((s) => !s.email), [directory]);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <SectionTitle>Add or fix an account</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-[var(--muted)]">
            Staff sign in with the email on their smhs.org directory card. Pick someone whose card
            has no email (or a wrong one) and enter the right address, or type a name the directory
            doesn&apos;t list to add them. They then sign in as usual and use &ldquo;Email me a setup
            link&rdquo; to create a password.
          </p>
          {loading ? (
            <Spinner label="Loading the staff directory…" />
          ) : !directory ? (
            <p className="text-sm text-[var(--muted)]">
              We couldn&apos;t load the staff directory. Check your connection and try again.
            </p>
          ) : (
            <>
              <StaffPicker
                key={pickerKey}
                staff={directory.staff}
                departments={directory.departments}
                label="Staff member"
                placeholder="Start typing a name…"
                selected={member}
                onSelect={choose}
                onQueryChange={(q) => {
                  setQuery(q);
                  setSaved(null);
                  setSetup(null);
                }}
              />
              {isNew && (
                <p className="text-xs text-[var(--muted)]">
                  <span className="font-semibold text-[var(--text)]">{name}</span> isn&apos;t in the
                  directory, so this adds them as a new person.
                </p>
              )}
              {member && member.email && (
                <p className="text-xs text-[var(--muted)]">
                  The directory currently has{' '}
                  <span className="font-semibold text-[var(--text)]">{member.email}</span>. Saving a
                  different address changes which email this person signs in with; their old
                  password won&apos;t carry over, so they&apos;ll set a new one.
                </p>
              )}
              <Field label="Email">
                <TextInput
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="name@smhs.org"
                  aria-invalid={Boolean(email) && !emailOk}
                />
              </Field>
              <Field label="Title (optional)">
                <TextInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={member?.title || 'e.g. Girls Water Polo Head Coach'}
                />
              </Field>
              {isNew && (
                <Field label="Department (optional)" hint="Which dropdown they show up under.">
                  <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                    <option value="">None</option>
                    {directory.departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              {saved && (
                <div className="space-y-2 rounded-card bg-gold/10 px-3 py-2.5 text-sm text-[var(--text)]">
                  <p>
                    <span className="font-semibold">{saved.name}</span> can now sign in as{' '}
                    <span className="font-semibold">{saved.email}</span>.
                  </p>
                  {setup ? (
                    setup.emailed ? (
                      <p className="text-xs text-[var(--muted)]">
                        A password setup link was sent to {saved.email}. It expires in 1 hour.
                      </p>
                    ) : (
                      <p className="break-all text-xs text-[var(--muted)]">
                        This server can&apos;t send email yet (demo mode). Setup link:{' '}
                        <a href={setup.setupUrl} className="font-semibold text-royal underline dark:text-gold">
                          {setup.setupUrl}
                        </a>
                      </p>
                    )
                  ) : (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void sendSetup()}>
                      {busy ? 'Sending…' : 'Email them a password setup link'}
                    </Button>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                disabled={!name || !emailOk || busy}
                onClick={() => void save()}
              >
                {busy ? 'Saving…' : isNew ? 'Add staff member' : 'Save email'}
              </Button>
            </>
          )}
        </Card>
      </section>

      <section className="space-y-2">
        <SectionTitle>Missing an email{directory ? ` (${missing.length})` : ''}</SectionTitle>
        {!directory ? null : missing.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--muted)]">
            Everyone in the directory has an email. Nobody is locked out of the portals.
          </Card>
        ) : (
          <Card className="divide-y divide-[var(--divider)]">
            <p className="px-4 py-3 text-xs text-[var(--muted)]">
              These directory entries have no email on smhs.org, so they can&apos;t sign in until
              one is added here.
            </p>
            {missing.map((p) => (
              <div key={p.name} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[var(--text)]">{p.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {p.title || p.departments.join(', ') || 'No title listed'}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => fixEmail(p)}>
                  Add email
                </Button>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle>Added or changed by hand</SectionTitle>
        {overrides === undefined ? (
          <Spinner />
        ) : overrides === null ? (
          <Card className="p-4 text-sm text-[var(--muted)]">
            Couldn&apos;t load this list. It needs an admin sign-in to the Staff Portal on this
            device.
          </Card>
        ) : overrides.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--muted)]">
            Nothing yet. Accounts added or corrected here appear in this list; everything else
            comes straight from the smhs.org directory.
          </Card>
        ) : (
          <Card className="divide-y divide-[var(--divider)]">
            {overrides.map((o) => (
              <div key={o.name} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text)]">{o.name}</span>
                    {directory?.staff.some((s) => s.name === o.name && s.added) && (
                      <Pill tone="muted">Not on smhs.org</Pill>
                    )}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {o.title ? `${o.title} · ` : ''}
                    {o.email}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    by {o.updatedBy}, {new Date(o.at).toLocaleDateString()}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void remove(o)}>
                  Remove
                </Button>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
