'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { API_BASE } from '@/config/api';
import { getSessionToken } from '@/lib/portalAuth';
import { useMounted } from '@/lib/hooks';
import { formatRelative } from '@/lib/time';
import { AdminGate } from '@/components/AdminGate';
import { ChevronRight } from '@/components/icons';
import { Button, Card, Pill, Segmented, Spinner, cx } from '@/components/ui';

/**
 * The admin metrics dashboard: anonymous, role-split aggregates computed by the
 * server (see server/metrics.mjs). Numbers refresh at the start of every week —
 * a new weekly bucket opens and the old one freezes — and the underlying data
 * is permanently deleted 30 days after collection. Support tickets are the one
 * exception: they persist until resolved and beyond.
 */

const ROLES = ['student', 'parent', 'teacher', 'admin'] as const;
type Role = (typeof ROLES)[number];
const ROLE_LABEL: Record<Role, string> = {
  student: 'Students',
  parent: 'Parents',
  teacher: 'Teachers',
  admin: 'Admins',
};

interface WeekRoleStats {
  weeklyActive: number;
  avgDailyActive: number;
  sessions: number;
  avgSessionMin: number | null;
  sessionsPerDevice: number | null;
  retentionPct: number | null;
  returned: number;
  lapsed: number | null;
  announcementOpenPct: number | null;
  optIns: number;
  optOuts: number;
}

interface Summary {
  generatedAt: string;
  windowDays: number;
  weekStart: string;
  weeks: { start: string; end: string; current: boolean; byRole: Record<Role, WeekRoleStats> }[];
  adoption: Record<Role, { feature: string; users: number; pct: number }[]>;
  monthlyActive: Record<Role, number>;
  knownDevices: number;
}

interface Ticket {
  num: number;
  role: Role;
  subject: string;
  body: string;
  /** Sender-volunteered follow-up address; null = the sender stayed anonymous. */
  contactEmail: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Friendly names for the screen/feature keys the reporter sends. */
function featureLabel(key: string): string {
  const named: Record<string, string> = {
    '/home': 'Home',
    grades: 'Grades (Aeries)',
    'support-ticket': 'Support ticket sent',
  };
  if (named[key]) return named[key];
  const last = key.split('/').filter(Boolean).pop() ?? key;
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ');
}

const WEEK_LABEL_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const weekLabel = (iso: string) => WEEK_LABEL_FMT.format(new Date(`${iso}T12:00:00`));

/** A collapsible category section — closed by default except the first. */
function Collapse({
  title,
  sub,
  defaultOpen = false,
  children,
}: {
  title: string;
  sub?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="tap flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[var(--text)]">{title}</span>
          {sub && <span className="block text-xs text-[var(--muted)]">{sub}</span>}
        </span>
        <ChevronRight
          className={cx('h-5 w-5 shrink-0 text-[var(--muted)] transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && <div className="space-y-4 border-t border-[var(--divider)] p-4">{children}</div>}
    </Card>
  );
}

/** One metric as a role-split table: a row per role, a column per statistic. */
function RoleTable({
  title,
  sub,
  columns,
  cell,
}: {
  title: string;
  sub?: string;
  columns: string[];
  cell: (role: Role, col: number) => ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      {sub && <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)]">
              <th className="py-1 pr-2 font-semibold" />
              {columns.map((c) => (
                <th key={c} className="py-1 pr-2 text-right font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => (
              <tr key={role} className="border-t border-[var(--divider)]">
                <td className="py-1.5 pr-2 font-semibold text-[var(--text)]">{ROLE_LABEL[role]}</td>
                {columns.map((c, i) => (
                  <td key={c} className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]">
                    {cell(role, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const dash = <span className="text-[var(--muted)]">—</span>;
const show = (v: number | null | undefined, suffix = '') => (v == null ? dash : `${v}${suffix}`);

function TicketRow({
  t,
  onResolve,
  onReopen,
  busy,
}: {
  t: Ticket;
  onResolve?: (num: number) => void;
  onReopen?: (num: number) => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-card border border-[var(--divider)] p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-[var(--text)]">#{t.num}</span>
        <Pill tone="muted">{ROLE_LABEL[t.role] ?? t.role}</Pill>
        <span className="ml-auto text-xs text-[var(--muted)]">{formatRelative(t.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-[var(--text)]">{t.subject}</p>
      <p className={cx('mt-1 whitespace-pre-wrap text-sm text-[var(--text)]', !expanded && 'line-clamp-3')}>
        {t.body}
      </p>
      {t.contactEmail && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Follow-up:{' '}
          <a
            href={`mailto:${t.contactEmail}?subject=${encodeURIComponent(`SMCHS App Support Ticket ${t.num}`)}`}
            className="font-semibold text-royal underline dark:text-gold"
          >
            {t.contactEmail}
          </a>
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {t.body.length > 160 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="tap text-xs font-bold text-royal dark:text-gold"
          >
            {expanded ? 'Show less' : 'Show all'}
          </button>
        )}
        {onResolve && (
          <Button size="sm" className="ml-auto" disabled={busy} onClick={() => onResolve(t.num)}>
            Mark resolved
          </Button>
        )}
        {onReopen && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={busy}
            onClick={() => onReopen(t.num)}
          >
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}

function MetricsDashboard() {
  const mounted = useMounted();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauthorized' | 'offline'>('loading');
  const [weekIdx, setWeekIdx] = useState(0);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = getSessionToken();
    if (!token) return null;
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        authed('/api/metrics/summary'),
        authed('/api/support/list'),
      ]);
      if (!sRes || sRes.status === 401 || sRes.status === 403) {
        setStatus('unauthorized');
        return;
      }
      if (!sRes.ok) {
        setStatus('offline');
        return;
      }
      setSummary(await sRes.json());
      if (tRes?.ok) setTickets(((await tRes.json()) as { tickets: Ticket[] }).tickets ?? []);
      setStatus('ok');
    } catch {
      setStatus('offline');
    }
  }, [authed]);

  useEffect(() => {
    if (mounted) void load();
  }, [mounted, load]);

  const setResolved = async (num: number, resolved: boolean) => {
    setResolveBusy(true);
    try {
      const res = await authed('/api/support/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolved ? { num } : { num, resolved: false }),
      });
      if (res?.ok) {
        // Moves the ticket between the Open and Resolved lists; the sender's
        // device learns on its next status check and shows (or drops) the
        // resolution notice.
        setTickets((ts) =>
          ts.map((t) =>
            t.num === num ? { ...t, resolvedAt: resolved ? new Date().toISOString() : null } : t,
          ),
        );
      }
    } finally {
      setResolveBusy(false);
    }
  };

  const week = summary?.weeks[weekIdx];
  const weekOptions = useMemo(
    () =>
      (summary?.weeks ?? []).map((w, i) => ({
        value: String(i),
        label: i === 0 ? 'This week' : i === 1 ? 'Last week' : weekLabel(w.start),
      })),
    [summary],
  );
  const openTickets = tickets.filter((t) => !t.resolvedAt);
  const resolvedTickets = tickets.filter((t) => t.resolvedAt);

  if (!mounted || status === 'loading') return <Spinner label="Crunching the numbers…" />;

  if (status === 'unauthorized') {
    return (
      <Card className="p-4">
        <p className="font-semibold text-[var(--text)]">Admin sign-in required</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Metrics are visible to app administrators only. Sign in to the Staff Portal with an
          admin account, then come back.
        </p>
        <Link href="/portal/" className="mt-2 inline-block text-sm font-bold text-royal dark:text-gold">
          Open Staff Portal →
        </Link>
      </Card>
    );
  }

  if (status === 'offline' || !summary || !week) {
    return (
      <Card className="p-4">
        <p className="font-semibold text-[var(--text)]">Metrics unavailable</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The server can&apos;t be reached right now. Try again in a minute.
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  }

  const r = (role: Role) => week.byRole[role];

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--muted)]">
        Anonymous, aggregate-only usage data split by role. A new week starts every Monday;
        data is kept {summary.windowDays} days from collection, then permanently deleted.
        Support tickets are kept until handled (and after).
      </p>

      {weekOptions.length > 1 && (
        <Segmented
          label="Week"
          value={String(weekIdx)}
          onChange={(v) => setWeekIdx(Number(v))}
          itemClassName="flex-1"
          options={weekOptions.slice(0, 4)}
        />
      )}
      <p className="text-xs text-[var(--muted)]">
        Week of {weekLabel(week.start)} – {weekLabel(week.end)}
        {week.current ? ' (in progress)' : ''} · {summary.knownDevices} devices known to the server
      </p>

      <Collapse title="Engagement" sub="Active users, feature adoption, sessions, retention" defaultOpen>
        <RoleTable
          title="Active users"
          sub="Unique devices — one device opening the app many times counts once."
          columns={['Daily avg', 'This week', 'Last 30 days']}
          cell={(role, col) =>
            col === 0
              ? show(r(role).avgDailyActive)
              : col === 1
                ? show(r(role).weeklyActive)
                : show(summary.monthlyActive[role])
          }
        />
        <RoleTable
          title="Sessions"
          sub="One session is one stretch with the app open — opening it starts one, leaving it ends one. Nothing to do with signing in."
          columns={['Avg length', 'Opens/wk per device', 'Total']}
          cell={(role, col) =>
            col === 0
              ? show(r(role).avgSessionMin, ' min')
              : col === 1
                ? show(r(role).sessionsPerDevice)
                : show(r(role).sessions)
          }
        />
        <RoleTable
          title="Retention (week over week)"
          sub="Of the devices active the previous week, how many came back this week."
          columns={['Return rate', 'Returned', 'Did not return']}
          cell={(role, col) =>
            col === 0
              ? show(r(role).retentionPct, '%')
              : col === 1
                ? show(r(role).returned)
                : show(r(role).lapsed)
          }
        />
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">Feature interest & adoption</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            The share of each role&apos;s active devices (last {summary.windowDays} days) that used
            a feature at all.
          </p>
          <div className="mt-2 space-y-3">
            {ROLES.map((role) => {
              const rows = summary.adoption[role] ?? [];
              if (rows.length === 0) return null;
              return (
                <div key={role}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {ROLE_LABEL[role]}
                  </p>
                  <div className="mt-1 space-y-1">
                    {rows.slice(0, 8).map((f) => (
                      <div key={f.feature} className="flex items-center gap-2 text-sm">
                        <span className="w-36 shrink-0 truncate text-[var(--text)]">
                          {featureLabel(f.feature)}
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                          <span
                            className="block h-full rounded-full bg-royal dark:bg-gold"
                            style={{ width: `${Math.min(100, f.pct)}%` }}
                          />
                        </span>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
                          {f.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {ROLES.every((role) => (summary.adoption[role] ?? []).length === 0) && (
              <p className="text-sm text-[var(--muted)]">No feature data yet.</p>
            )}
          </div>
        </div>
      </Collapse>

      <Collapse title="Communication" sub="Announcement reads, notification opt-ins and opt-outs">
        <RoleTable
          title="Announcement open rate"
          sub="Devices that opened at least one announcement this week."
          columns={['Opened']}
          cell={(role) => show(r(role).announcementOpenPct, '%')}
        />
        <RoleTable
          title="Notifications"
          sub="Alert opt-ins and opt-outs this week. A spike in opt-outs signals notification fatigue."
          columns={['Opted in', 'Opted out']}
          cell={(role, col) => (col === 0 ? show(r(role).optIns) : show(r(role).optOuts))}
        />
      </Collapse>

      <Collapse title="Support" sub={`${openTickets.length} open · ${resolvedTickets.length} resolved`}>
        {openTickets.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No open tickets. Nice and quiet.</p>
        ) : (
          <div className="space-y-2">
            {openTickets.map((t) => (
              <TicketRow
                key={t.num}
                t={t}
                busy={resolveBusy}
                onResolve={(n) => void setResolved(n, true)}
              />
            ))}
          </div>
        )}
        {resolvedTickets.length > 0 && (
          <div className="rounded-card border border-[var(--divider)]">
            <button
              onClick={() => setResolvedOpen((o) => !o)}
              className="tap flex w-full items-center gap-2 px-3 py-2.5 text-left"
              aria-expanded={resolvedOpen}
            >
              <span className="flex-1 text-sm font-semibold text-[var(--text)]">
                Resolved ({resolvedTickets.length})
              </span>
              <ChevronRight
                className={cx(
                  'h-4 w-4 text-[var(--muted)] transition-transform',
                  resolvedOpen && 'rotate-90',
                )}
              />
            </button>
            {resolvedOpen && (
              <div className="space-y-2 border-t border-[var(--divider)] p-3">
                {resolvedTickets.map((t) => (
                  <TicketRow
                    key={t.num}
                    t={t}
                    busy={resolveBusy}
                    onReopen={(n) => void setResolved(n, false)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Collapse>
    </div>
  );
}

export default function AdminMetricsPage() {
  return (
    <AdminGate title="Metrics">
      <MetricsDashboard />
    </AdminGate>
  );
}
