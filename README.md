# SMCHS App

Student app for Santa Margarita Catholic High School. It runs as a website, installs as a PWA, and ships to iOS and Android through Capacitor from the same build.

The main screen counts down the time left in the current period. Once a device has the schedule, that keeps working with no network.

`server/index.mjs` serves the static build and the API from a single port, same origin. It uses Node built-ins only, `node:sqlite` included, so the server has no npm dependencies and there is no database to administer. The client is Next.js 14 with static export, plus Tailwind, Zustand, and Luxon.

## Deploy

[DEPLOY-SMHS.md](DEPLOY-SMHS.md) covers the school's server: Alpine Linux, NginxProxyManager, an internal SMTP relay. [DEPLOY.md](DEPLOY.md) covers anything else.

```sh
git clone https://github.com/benpatter/SMHS-APP.git /opt/smapp
cp /opt/smapp/.env.example /opt/smapp/.env    # fill it in
/opt/smapp/start-prod.sh
```

`start-prod.sh` installs dependencies, rebuilds when the checkout has moved since the last build, and serves on `$PORT` (8080 unless you change it). You need Node 22.13 or newer and a reverse proxy in front of it for TLS.

## Develop

```sh
npm install
npm run dev                 # app on :3000
node server/index.mjs       # API on :8787
```

`./start.sh` runs the production arrangement locally instead, with both on :3000.

Native shells:

```sh
npm run build
npx cap add ios             # or android, first time only
npm run cap:sync
npx cap open ios
```

Capacitor builds fetch across origins, so point them at the server with `NEXT_PUBLIC_API_BASE=https://<your-domain>`. The web build uses its own origin and needs nothing.

## How it works

`src/lib/scheduleEngine.ts` takes the time, the bell schedule, and the student's profile, and returns one state: in a period, passing, before school, after school, or no school. It makes no network calls and has no side effects, which is why the countdown survives a dead connection.

The server pulls the staff directory, clubs, athletics, and news from smhs.org, caching each source in memory with single-flight and serving stale copies while it refreshes. A few thousand phones polling every 30 seconds still add up to a handful of requests upstream. Schedule data comes from the school's BellCalSync API when `CALENDAR_API_KEY` is set, and from the public CalendarWiz feed when it isn't.

Admins edit announcements, notices, schedule changes, dining, contacts, prayers, and campus map pins inside the app. Those writes land in `server/.data/data.json`, and devices pick them up from `/api/data` on an ETag-cached poll.

When a source is unreachable the app prints "Schedule unavailable" or "Hours unavailable" and leaves it there. Guessing a bell time or a front-office number would be worse than showing nothing.

## Privacy

Students don't have accounts. Their profile and settings sit in the browser and never reach the server.

The server holds school content and staff logins. Staff passwords are scrypt digests with per-user salts, and session tokens are stored as sha256 hashes rather than in the clear.

Usage metrics are per-role counts against a random device id, with no name, email, or IP attached. A timer deletes those rows from the database 30 days after collection, so the dashboards can only ever show the last month. Anonymous support tickets stay longer. The app carries no ads and no third-party scripts.

The policy that covers SOPIPA, CCPA/CPRA, SB 568, and FERPA is in the app under **More → Privacy**.
