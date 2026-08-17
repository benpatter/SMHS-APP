# SMCHS App

One fast, offline-first app for **Santa Margarita Catholic High School** Eagles. Web and PWA, wrappable to iOS and Android via Capacitor from a single codebase. The home screen is the hero: a live "time left in this period" countdown.

One Node process serves everything, the static app and the live-data API, same-origin on one port. No database to run, no external services beyond SMTP.

**Stack:** Next.js 14 (App Router, TypeScript, static export), Tailwind, Zustand, Luxon, Capacitor. The server is `server/index.mjs`, a single file using only Node built-ins, including `node:sqlite`. Zero runtime npm dependencies on the server side.

## Deploy

**[DEPLOY-SMHS.md](DEPLOY-SMHS.md)** is the start-to-finish runbook for the school server (Alpine Linux, NginxProxyManager, an internal mail relay). Follow it top to bottom and nothing else is needed.

[DEPLOY.md](DEPLOY.md) is the general guide for any other host.

```sh
git clone https://github.com/benpatter/SMHS-APP.git /opt/smapp
cp /opt/smapp/.env.example /opt/smapp/.env   # fill it in
/opt/smapp/start-prod.sh                     # installs, builds, serves
```

Requires Node 22.13 or newer. Put a TLS reverse proxy in front of it.

## Develop

```sh
npm install
npm run dev                 # app on http://localhost:3000
node server/index.mjs       # API on http://localhost:8787

./start.sh [--build]        # one process, app + API on :3000, like production
```

Native shells:

```sh
npm run build
npx cap add ios             # or android, first time only
npm run cap:sync
npx cap open ios
```

Native builds fetch cross-origin, so set `NEXT_PUBLIC_API_BASE=https://<your-domain>` for Capacitor. The web build is same-origin and needs nothing.

## How it works

- **The countdown is pure and offline.** `src/lib/scheduleEngine.ts` is a deterministic `(now, config, profile) → state`. No network needed once the schedule is cached.
- **Clients never call outside sources.** The server scrapes and caches smhs.org and the school's calendar API, so thousands of devices polling stay a handful of upstream requests. Set `CALENDAR_API_KEY` to use the school's BellCalSync feed; without it the app parses the public CalendarWiz feed instead.
- **Admins publish in-app.** Announcements, notices, schedule edits, dining, contacts, prayers, and map pins live server-side at `/api/data` and sync to every device.
- **Honest about gaps.** When a live source is unreachable the app says "Schedule unavailable" rather than inventing times, phone numbers, or content.
- **One brand config.** `tailwind.config.ts` holds Royal Blue `#1A4784`, Vegas Gold `#B4A365`, Anthracite `#282828`. No red except destructive states.

## Privacy

Built for minors and school staff in California, so privacy is architectural rather than a policy page.

- **No student accounts and no student data on the server.** Profile, schedule, and settings stay on the device.
- **The server stores school content and staff logins only.** Passwords are salted scrypt digests; session tokens are stored hashed.
- **No ads, no third-party trackers, no data sold.** Usage metrics are anonymous and aggregate only, with a random device id and never a name, email, or IP, hard-deleted after 30 days.

Written to satisfy SOPIPA, CCPA/CPRA minor provisions, SB 568, and FERPA minimization. The full plain-English policy is in the app at **More → Privacy**.
