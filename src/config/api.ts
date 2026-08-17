/**
 * Base URL of the SMCHS live-data server (see /server). In production the same
 * Node server serves BOTH the static app and /api/*, so the default is
 * same-origin (''), and the app works on any domain with no rebuild. In dev
 * (`next dev`) the app runs on :3000 and the proxy on :8787, so the default
 * points there. Override either with NEXT_PUBLIC_API_BASE at build time.
 *
 * When the server is unreachable the app degrades gracefully to its built-in
 * fallbacks (it never fabricates "live" content).
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : '');
