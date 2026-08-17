# SMCHS App

One fast, offline-first app for **Santa Margarita Catholic High School** Eagles — web + PWA, wrappable to iOS/Android via Capacitor from a single codebase. The home screen is the hero: a **live "time left in this period" countdown**. Grades hand off to Aeries.

## Deploy (production)

**Deploying to the school's server? Follow [DEPLOY-SMHS.md](DEPLOY-SMHS.md).** That is
the start-to-finish runbook for the school deployment (Alpine Linux, Node 26,
NginxProxyManager, an internal mail relay): the `.env` to fill in, the OpenRC
service, the reverse-proxy settings, and the backup job. Follow it top to
bottom and nothing else is needed.

[DEPLOY.md](DEPLOY.md) is the general, platform-agnostic guide (its service example
assumes systemd, which Alpine does not have). Short version: one Node process
serves the app AND the API same-origin on one port; IT copies `.env.example` →
`.env`, runs `./start-prod.sh`, and points the domain's TLS reverse proxy at the port.

## Stack
- **Next.js 14 (App Router, TypeScript)** — `output: 'export'` static build (PWA + Capacitor).
- **Tailwind CSS** with a small component layer (`src/components/ui.tsx`).
- **Luxon** — all schedule logic is explicit about `America/Los_Angeles`.
- **Zustand** (localStorage persistence) — the on-device profile/schedule. No student accounts.
- **Capacitor** — native iOS/Android shells over the same `out/` build.
- **`server/index.mjs`** — single-file Node server, zero npm deps: serves the static build, scrapes/caches the live smhs.org feeds, hosts the server-owned school content (`/api/data`), and staff auth.

## Run (development)
```bash
npm install
npm run dev                 # app on http://localhost:3000 (dev)
node server/index.mjs       # API on http://localhost:8787 (dev default base)

./start.sh [--build]        # local prod test over Tailscale: one process, app + API on :3000
```

### Live data & the calendar API
Clients never call outside sources directly: the server scrapes and caches them
(single-flight + serve-stale), and ~6000 devices polling stays a handful of
upstream requests. Schedule and events come from the school's **calendar
service (BellCalSync partner API)**.

- `CALENDAR_API_KEY` — the partner key, **server-side only**: environment variable on the server
  host, never in the app bundle, browser code, or this repo. Without it the server falls back to
  parsing the public CalendarWiz iCal feeds.
- `CALENDAR_API_BASE` — optional override of the API base URL.
- The API is additive-only; the server reads enums (buildings, sports, schedule types) from
  `/meta` and `/sports` at runtime instead of hard-coding them.

## Native (Capacitor)
```bash
npm run build
npx cap add ios      # or: npx cap add android   (first time)
npm run cap:sync
npx cap open ios     # / android
```
Note: native shells fetch cross-origin, so build with `NEXT_PUBLIC_API_BASE=https://<your-domain>`
for Capacitor (the web build defaults to same-origin and needs nothing).

## Architecture
- **Server-owned school content** (`/api/data`): announcements, notices/banner, per-day schedule edits, athletics edits, dining, contacts, prayers, campus-map pins/outlines, school links. Admins edit in-app; every device syncs (ETag-cached, ~30-45s jittered poll).
- **Engine** (`src/lib/scheduleEngine.ts`): pure, deterministic `(now, config, profile) → state` (in-period / passing / before / after / no-school). Powers the countdown and is fully offline.
- **Honest data**: when a live source is unreachable the app says so ("Schedule unavailable", "Hours unavailable") — it never fabricates times, phones, or content.
- **Offline-first**: service worker (`public/sw.js`) caches the app shell; the last-fetched schedule keeps working.
- **One theme config** = single source of truth for the brand (`tailwind.config.ts`): Royal Blue `#1A4784`, Vegas Gold `#B4A365`, Anthracite `#282828`. No red except destructive states.

## Privacy & audience
Built for **minors (high-school students, 13–18) and school staff in California** — privacy is architectural, not a checkbox:
- **On-device by default**: profile, schedule, and settings never leave the device. No accounts for students.
- **The server stores school content and staff auth only** — no student data, ever. Staff credentials are salted scrypt digests; session tokens are stored hashed.
- **No ads, no third-party trackers, no sale of data.** The app's own server keeps **anonymous, aggregate-only usage metrics** (`server/metrics.mjs`): events carry a random device id and a role, never a name/email/IP; admins see only role-split totals; every usage row is hard-deleted 30 days after collection. Anonymous support tickets are the one thing kept longer.
- **Compliance posture**: **SOPIPA** (Cal. B&P § 22584 — no targeted ads/profiling/sale), **CCPA/CPRA** minors (no sale/share; § 1798.120(c)), **SB 568** eraser (Settings → Delete all my data), **FERPA** minimization (no education records stored). Full plain-English policy in-app at **More → Privacy**.

## Production audit
`audit-report-production-2026-07-30.md` — the full pre-launch audit and remediation log.
