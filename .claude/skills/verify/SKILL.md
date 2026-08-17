---
name: verify
description: Build, serve, and drive the SMCHS app end-to-end to verify changes at the UI surface.
---

# Verifying the SMCHS app

Static Next.js export + a live-data proxy. Verify at the browser surface.

## Build & serve

```bash
npm run build                      # typechecks, lints, and exports to out/
cd out && python3 -m http.server 3999 &   # serve the static export
curl -s http://localhost:8787/api/staff | head -c 100   # proxy usually already running locally
```

⚠️ **`next build` corrupts a running `next dev`** — they share `.next/`. If the
user has `next dev` on :3000, it will start throwing `Cannot find module
'./NNN.js'` after any build. Fix: kill the dev server, `rm -rf .next`, restart
it (use `setsid nohup npx next dev ... & disown`; a bare `pkill -f "next dev"`
in the same compound command kills your own shell — pkill by PID instead).

The proxy (`server/`, port 8787) powers the live schedule, staff directory, and
portal auth. If it's down the app degrades gracefully — directory-based flows
(portal sign-in pickers) won't be testable.

## Drive with Playwright

No playwright in the project. A working install lives in the npx cache — symlink
it next to your script and pin the executable to a cached browser:

```js
// ln -sfn ~/.npm/_npx/<hash>/node_modules <scratch>/node_modules
import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: process.env.HOME +
    '/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
});
```

Gotchas:
- Use `{ waitUntil: 'domcontentloaded' }` on goto/reload — the service worker
  can hold `load` open past timeouts.
- Bottom-nav labels (Announcements, Calendar, More) collide with page rows in
  strict-mode text locators; use `.first()` or role-scoped locators.
- App state is zustand-persist in `localStorage['smchs-app-v1']` — clear it for
  a "fresh device", or seed an old `version:` payload to test migrations.

## Flows worth driving

- Welcome "Who are you?" (fresh device) → student form (email must be
  @smhsstudents.org) → home; reload boots straight to home.
- Sign out → welcome asks "Are you {name}?" (one-tap re-login).
- Staff: welcome → /portal/ chooser → Teacher portal → type "test" in the name
  picker → "Teacher test" account skips the password step. Reload of `/` must
  redirect a signed-in staff device to their portal.
- More page differs by role (student: grades/schedule/share/hall pass; staff:
  name + directory title, trimmed sections).
