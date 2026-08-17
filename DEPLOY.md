# Deploying the SMCHS App

One Node process serves everything: the app (static files) and the live-data
API, same-origin, on one port. No database, no external services beyond SMTP.

> **Deploying on Alpine Linux behind NginxProxyManager?** Follow
> **[DEPLOY-SMHS.md](DEPLOY-SMHS.md)** instead: the start-to-finish school
> runbook, with the `.env` to fill in, an OpenRC service because Alpine has no
> systemd, the reverse-proxy settings, and a backup job. This document is the
> general guide and its service example assumes systemd.

## Requirements

- Node.js 22.13+ (uses only Node built-ins including node:sqlite — which loads without a flag from 22.13.0 — zero runtime npm dependencies for the server; `start-prod.sh` checks this up front)
- Outbound HTTPS access to smhs.org and the BellCalSync calendar API
- An SMTP relay for staff password-setup emails
- A TLS-terminating reverse proxy for your domain (nginx, Caddy, IIS ARR, whatever is standard)

## Steps

```sh
git clone <repo> smapp && cd smapp
cp .env.example .env      # fill it in (see the comments in the file)
./start-prod.sh           # installs deps, builds, serves on $PORT (default 8080)
```

Point the reverse proxy for your domain (e.g. `https://app.smhs.org`) at
`http://127.0.0.1:8080`. That's the whole deployment.

To pick up an app update: `git pull`, then restart (`systemctl restart smapp`
under the unit below, or re-run `./start-prod.sh`). The script notices what
the pull changed — dependencies are reinstalled when the lockfile moved, and
the app is rebuilt whenever the checkout no longer matches the last build —
so a plain restart can never serve a stale bundle. `./start-prod.sh --build`
still forces a rebuild unconditionally.

Run it under your process supervisor of choice (systemd, pm2, a Windows
service) so it restarts on boot. Example systemd unit:

```ini
[Unit]
Description=SMCHS app
After=network-online.target

[Service]
WorkingDirectory=/opt/smapp
ExecStart=/opt/smapp/start-prod.sh
Restart=always
User=smapp

[Install]
WantedBy=multi-user.target
```

## Configuration (.env)

| Var | Required | Purpose |
| --- | --- | --- |
| `PORT` | no (8080) | Port the app + API serve on |
| `HOST` | no (127.0.0.1) | Bind address. The default is loopback-only, so the plain-HTTP port is reachable only by a reverse proxy on the same machine. Set `0.0.0.0` only when the proxy runs on a different host (or for LAN/VPN testing) |
| `APP_ORIGIN` | **YES in production** | The app's public address (e.g. `https://app.smhs.org`), used to build the password-setup links that get emailed. Deliberately never taken from the request |
| `CALENDAR_API_KEY` | recommended | BellCalSync schedule feed (primary source) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | **YES in production** | Staff password-setup emails. With `SMTP_USER`+`SMTP_PASS` (always set together): port 587 (or any port except 465) speaks STARTTLS — the standard for Office 365 / Google Workspace relays — and 465 speaks implicit TLS; credentials only ever travel encrypted. With both left empty: anonymous relay mode for an internal send-only relay (e.g. port 25) — no AUTH, plain SMTP except on 465, requires `SMTP_FROM`; only for a relay on your own network. `SMTP_HOST` unset = demo mode: setup links appear in the browser, which is not safe for a real deployment |
| `ALLOWED_ORIGIN` | no | Lock CORS to one origin. Only needed if the API is exposed cross-origin; the app itself is same-origin |
| `ALLOW_TEST_ACCOUNTS`, `NEXT_PUBLIC_TEST_ACCOUNTS` | **leave unset** | Dev-only passwordless test accounts |

## What the server stores

`server/.data/` (create-on-demand, plain JSON):

- `data.json` — school content admins publish (schedules, notices, announcements, contacts…)
- `auth.db` — SQLite database of staff emails, salted scrypt password digests, and sha256-hashed session/setup tokens (a pre-existing `auth.json` is imported on first boot and kept as `auth.json.migrated`). Session rows also carry the staff member's display name, title, and portal, resolved from the directory at sign-in so a session can be restored without the roster
- `push.db` — SQLite database of Web Push subscriptions and the server's VAPID keypair, generated on first boot (a pre-existing `push.json` is imported and kept as `push.json.migrated`)
- `schedule-history.json`, `staff.json` — caches of scraped public school data
- `tiles/` — campus map imagery, fetched from the provider once per tile and kept forever (restricted to the campus area, a few hundred small images)

No student data is ever stored server-side. Back up `data.json`, `auth.db`,
and `push.db` — `push.db` holds the Web Push subscriptions AND the VAPID
keypair, and losing the keypair silently orphans every device's push
subscription. The caches rebuild themselves.

## Operations notes

- All upstream scraping is cached in-process with single-flight + serve-stale,
  so client load (tested for ~6000 devices polling every 30-45s) never
  multiplies into requests against smhs.org.
- Campus-map tiles are served from the server's own disk cache; the tile
  providers see each tile once ever, no matter how many devices load the map.
- Staff sign-ins are held in **two** places: a token the app keeps in
  localStorage (used as the `Authorization: Bearer` for writes) and an
  `HttpOnly` cookie the server sets. The cookie is what keeps staff signed in
  on iOS — the app is a home-screen PWA, and WebKit clears script-writable
  storage on its own schedule, which used to wipe the sign-in every day or so.
  Cookies set by the server are exempt from that, so `POST /api/auth/session`
  can rebuild the sign-in from the cookie alone. Two consequences for the proxy
  in front of this server: pass `Cookie`/`Set-Cookie` through untouched, and
  set `X-Forwarded-Proto` so the cookie is marked `Secure` (without it the
  cookie still works, just without that flag).
- Sessions expire only after **180 days of inactivity** — any authenticated
  request slides the expiry forward, so someone who keeps opening the app is
  never signed out by the clock. Signing out revokes the session server-side
  and clears the cookie.
- Auth endpoints are rate-limited per IP (10/min), except
  `POST /api/auth/session`, which every launch calls and which only checks a
  192-bit random token. The limiter is per-process:
  run ONE instance (it is more than enough), or the limit multiplies.
- Health check: `GET /api/health`.
- The service worker caches the app shell; deploys reach devices on their next
  load because HTML and `sw.js` are served `no-cache`.
