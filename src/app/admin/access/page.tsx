'use client';

import { useMemo, useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import { StaffPicker } from '@/components/StaffPicker';
import { isAdminEligible } from '@/components/PortalGate';
import { Button, Card, SectionTitle, Spinner } from '@/components/ui';
import { useStaffDirectory, type StaffMember } from '@/lib/providers/staff';
import { useAdminGrants, invalidateAdminGrants } from '@/lib/providers/adminGrants';
import { grantAdminAccess, revokeAdminAccess } from '@/lib/portalAuth';

/**
 * Administration → Admins: grant Admin-portal access by hand.
 *
 * The department/title rules cover the offices; this page covers everyone
 * else — a teacher who takes on an admin role, someone missed at launch. A
 * grant changes nothing about the account: same directory identity, same
 * password (or the usual emailed setup link if they never made one). The
 * Admin portal simply starts letting them in.
 */
export default function AdminAccessPage() {
  return (
    <AdminGate title="Admins">
      <GrantEditor />
    </AdminGate>
  );
}

function GrantEditor() {
  const { directory, loading } = useStaffDirectory();
  const grants = useAdminGrants();

  const [member, setMember] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [granted, setGranted] = useState<string | null>(null); // name just granted

  // Everyone who can NOT already use the Admin portal. People without a
  // directory email are out too: there is no account to widen.
  const pool = useMemo(
    () => (directory ? directory.staff.filter((s) => s.email && !isAdminEligible(s, grants)) : []),
    [directory, grants],
  );

  // The hand-granted list, shown with directory identities where we have them.
  const grantedPeople = useMemo(() => {
    const byEmail = new Map((directory?.staff ?? []).map((s) => [s.email, s]));
    return [...grants].map((email) => byEmail.get(email) ?? { name: email, title: '', email, departments: [] });
  }, [directory, grants]);

  const grant = async () => {
    if (!member) return;
    setBusy(true);
    setError('');
    const r = await grantAdminAccess(member.email);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'The change was not saved');
      return;
    }
    setGranted(member.name);
    setMember(null);
    await invalidateAdminGrants(); // the picker pool and the list below refresh
  };

  const revoke = async (email: string) => {
    setError('');
    const r = await revokeAdminAccess(email);
    if (!r.ok) setError(r.error ?? 'The change was not saved');
    else setGranted(null);
    await invalidateAdminGrants();
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <SectionTitle>Add an admin</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-[var(--muted)]">
            Pick someone from the staff directory to let them sign in to the Admin portal. Their
            account stays the same — same email, same password — they just gain admin access. People
            who already have it aren&apos;t listed.
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
                staff={pool}
                departments={directory.departments}
                label="Staff member"
                placeholder="Start typing a name…"
                selected={member}
                onSelect={(m) => {
                  setMember(m);
                  setGranted(null);
                  setError('');
                }}
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              {granted && (
                <p className="rounded-card bg-gold/10 px-3 py-2.5 text-sm text-[var(--text)]">
                  <span className="font-semibold">{granted}</span> can now sign in to the Admin
                  portal.
                </p>
              )}
              <Button className="w-full" disabled={!member || busy} onClick={() => void grant()}>
                {busy ? 'Saving…' : 'Enable admin logins'}
              </Button>
            </>
          )}
        </Card>
      </section>

      <section className="space-y-2">
        <SectionTitle>Added by hand</SectionTitle>
        {grantedPeople.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--muted)]">
            Nobody yet. Admins added here appear in this list; access from the offices (Dean&apos;s,
            Ed Tech, President&apos;s, Principal&apos;s) and the Rector is automatic and isn&apos;t
            shown.
          </Card>
        ) : (
          <Card className="divide-y divide-[var(--divider)]">
            {grantedPeople.map((p) => (
              <div key={p.email} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[var(--text)]">{p.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {p.title ? `${p.title} · ` : ''}
                    {p.email}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void revoke(p.email)}>
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
