/**
 * Anonymous usage reporting — the cashier calling each sale over the radio.
 * The client never keeps a tally; every event is reported to the server as it
 * happens and the server's ledger (see server/metrics.mjs) is the only count.
 *
 * Privacy model (FERPA / SOPIPA posture, minors in California):
 *   - This device is known to the server ONLY by a random UUID minted here and
 *     kept in localStorage. It is not a cookie, contains nothing, and links to
 *     nothing — no name, email, schedule, or IP is ever attached to it.
 *   - Events carry a type (screen opened, session ended…), the viewer's role
 *     (student/parent/teacher/admin), and nothing else. The server stamps the
 *     time and hard-deletes everything after 30 days.
 */
'use client';

import { API_BASE } from '@/config/api';
import { useAppStore } from './store';

const DEVICE_KEY = 'smchs-metrics-device';

export type MetricsRole = 'student' | 'parent' | 'teacher' | 'admin';

type MetricEvent = { t: string; n?: string; v?: number };

/** This device's anonymous id (minted on first use). Null when storage is blocked. */
export function metricsDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null; // no storage → no stable device → report nothing
  }
}

/** The role this device is using the app as, for the role-split dashboards. */
export function metricsRole(): MetricsRole | null {
  const s = useAppStore.getState();
  if (s.userRole === 'student') return 'student';
  if (s.userRole === 'parent') return 'parent';
  if (s.userRole === 'staff') return s.staffProfile?.portal === 'admin' ? 'admin' : 'teacher';
  return null; // welcome screen — nothing to attribute yet
}

// Events queue briefly (so one navigation isn't one request) and flush every
// few seconds — or immediately via sendBeacon when the app is backgrounded,
// which is the only delivery that survives a tab close.
const MAX_QUEUE = 50;
const FLUSH_MS = 8_000;
let queue: MetricEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function flush(useBeacon = false): void {
  if (queue.length === 0) return;
  const device = metricsDeviceId();
  const role = metricsRole();
  // No role yet (welcome screen): hold the queue — the events flush with the
  // right role the moment one is chosen.
  if (!device || !role) return;
  const url = `${API_BASE}/api/metrics/events`;
  // Drain the WHOLE queue in server-sized batches (25 max per post). A partial
  // drain would strand whatever is past the first batch — on the backgrounding
  // flush that includes the session event, which is always pushed last.
  while (queue.length > 0) {
    const payload = JSON.stringify({ device, role, events: queue.splice(0, 25) });
    try {
      // text/plain keeps this a CORS "simple request" (sendBeacon can't answer
      // a preflight); the server parses the JSON body regardless of content type.
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'text/plain' }));
      } else {
        void fetch(url, { method: 'POST', body: payload, keepalive: true }).catch(() => {
          // Server unreachable: usage stats are best-effort, drop the batch.
        });
      }
    } catch {
      // Reporting must never break the app.
      return;
    }
  }
}

/** Report one event. Fire-and-forget; safe to call from anywhere. */
export function track(t: MetricEvent['t'], n?: string, v?: number): void {
  if (typeof window === 'undefined') return;
  queue.push({ t, ...(n !== undefined ? { n } : {}), ...(v !== undefined ? { v } : {}) });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (!flushTimer) {
    flushTimer = setInterval(() => flush(), FLUSH_MS);
  }
}

/** A screen view, normalized to its route ("/", "/more/menu/" → "/more/menu"). */
export function trackScreen(pathname: string): void {
  const parts = pathname.split('/').filter(Boolean).slice(0, 2);
  const name = parts.length ? `/${parts.join('/')}` : '/home';
  // Mirrors the server's allowlist — a route that doesn't fit is not reported.
  if (name.length > 60 || !/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/.test(name)) return;
  track('screen', name);
}

let sessionStartedAt: number | null = null;
let sessionWired = false;

/**
 * Session + app-open tracking, wired once from the app shell. A session runs
 * from the app becoming visible to it being closed or backgrounded — like a
 * phone's screen-time counter — and its length reports on the way out via
 * sendBeacon, the delivery that survives the tab dying.
 */
export function initMetrics(): void {
  if (sessionWired || typeof window === 'undefined') return;
  sessionWired = true;

  track('open');
  sessionStartedAt = Date.now();

  const endSession = () => {
    if (sessionStartedAt === null) return;
    const seconds = Math.round((Date.now() - sessionStartedAt) / 1000);
    sessionStartedAt = null;
    if (seconds >= 1) track('session', undefined, seconds);
    flush(true); // beacon: the tab may be about to die
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      endSession();
    } else if (sessionStartedAt === null) {
      // Back to the foreground: a new session (and another app open — the
      // server de-duplicates devices, so actives never double-count).
      track('open');
      sessionStartedAt = Date.now();
    }
  });
  // pagehide covers closes that never fire visibilitychange (iOS Safari).
  window.addEventListener('pagehide', endSession);
}
