# SMCHS App Production-Readiness Audit — 2026-07-30

Three parallel Opus 5 auditors, one per dimension: data liveness, feature parity, design consistency.
Findings deduplicated and re-ranked by production impact. `file:line` refs verified by the auditors.

---

## Tier 1 — Ship blockers (wrong or lost data in production)

1. **Admin "School Info & Links" edits never leave the admin's device** (found independently by two auditors)
   `src/lib/store.ts:914` uses `set()` not `_pushData`; `ServerData` has no `school` field (`src/lib/providers/data.ts`).
   An admin fixes the attendance phone / Aeries URL, sees it work on their phone, and every student keeps the hardcoded `src/config/school.ts:29` value forever.
   Fix: add `school?: SchoolOverrides` to `ServerData`, route `setSchoolOverride` through `_pushData`, read via `effectiveSchool()`.

2. **Admin calendar events are device-local while admin athletics events are server-owned**
   `src/lib/store.ts:809-829` (`addEvent`/`deleteEvent`/`setEventHidden` write `admin.events` locally) vs `addAthleticsEvent` which uses `_pushData`. Admin posts "Spring Concert" and nobody sees it. `ServerData.events` already exists and is the right home.

3. **Offline/cold-start devices fabricate a school day during breaks**
   `src/lib/calendar.ts:47`: when the live schedule isn't loaded, `dayTypeFor()` returns `'regular'` for any weekday, so the app shows full 2026-27 Regular Day bell times with a live countdown in July or over Christmas break.
   Fix: return an explicit "schedule unavailable" state instead of `'regular'`.

4. **ETV page is entirely fake data**
   `src/lib/providers/etv.ts:28-57`: 4 hardcoded episodes dated June 2026, all permanently unplayable ("Source pending"). No scraper, no admin editor.
   Fix: cut the page from More until a real feed exists, or build scraper + `ServerData.etvEpisodes` + admin editor.

5. **Hall pass surfaces are dead ends**
   `PASSES_ENABLED = false` (`server/index.mjs:1184`); `/admin/hall-pass` and `/portal/teacher/hall-pass` both `redirect()` away, so `HallPassReview` and `approveHallPass`/`denyHallPass` are unreachable, yet the admin dashboard still shows a "Passes" tile for passcode-only admins (`AdminDashboard.tsx:213`), and `/more/hall-pass` is deep-linkable and files passes nobody will ever see. `noticePages.ts` also offers it as a notice placement.
   Fix: remove the tile + placement row and close the routes while shelved, or un-shelve properly.

6. **Attendance procedure and office hours are static with no correction path**
   `src/config/school.ts:31-33` (flagged `confirmWithSchool: true`) render verbatim on `/more/attendance`. Only the phone has an override field.
   Fix: fold procedure + hours into server-owned school overrides.

7. **Security phone hardcoded in two places and presented as live**
   `server/index.mjs:1128` (fallback inside the "scraper" output) and `src/app/more/safety/page.tsx:12`. A number change requires two code edits; a stale emergency number is high-stakes.
   Fix: single server-owned source, honest unavailable state otherwise.

## Tier 2 — Fix before launch (admins/users will hit these)

**Sync + editability gaps**
- Announcements: add/hide/delete but **no edit** UI; `updateAnnouncement` exists unused (`store.ts:281`). Typo = delete-and-repost.
- Calendar events: same gap; `updateEvent` exists unused (`store.ts:294`).
- Day-type overrides: can clear but not set (`setDayTypeOverride` has no UI), device-local, silently diverges one device's countdown. Delete the legacy field or fold into `scheduleDays`.
- Games subsystem is dead code: `addGame`/`updateGame`/`setGameResult` have zero call sites, seed empty, `result` never rendered, `admin.gameResults` never read. Delete or finish.
- No PIN change/reset UI (`setAdminPin`/`resetAdmin` unused); first passcode typed is permanent.
- Map deletions permanent with no hide/restore, unlike every sibling editor; a deleted seed building is unrecoverable on all devices.
- Non-athletics live-calendar events can't be edited or hidden at all; athletics events can. Drop the category scoping on `eventEdits`.
- Admin athletics lists only future events; a mistitled past event is uncorrectable.
- Contacts editor lacks hide + reorder that prayers have.
- Parents can't import a child's schedule though the store supports it (`more/page.tsx:177` hides the row).

**Data honesty**
- Menu hours fallback fabricates "Open now/Closed" from a hardcoded `'7:00 AM – 3:00 PM'` (`more/menu/page.tsx:97-106`). Show "Hours unavailable" instead.
- Dining section note ("1:00–3:00 PM") not admin-editable.
- `MAIN_OFFICE` + `PARENT_LIAISON` (named person) bypass `effectiveContacts` (`more/contacts/page.tsx:218-230`); no admin can correct them.
- Faith prayer-request Microsoft Form URL hardcoded (`more/faith/page.tsx:9-10`); Forms rot yearly.
- Athletics tickets/livestream URLs hardcoded (`more/athletics/page.tsx:16-17`).
- Lunch-track map static (`config/buildings.ts:20-33`) while the same data is scraped live for the menu page; schedule personalization can disagree with the live chart.
- `parseClubs`/`parseDining` return hardcoded contact/title inside "scraped" output (`server/index.mjs:1039,1080`).
- Bell-schedule templates have no school-year stamp; 2026-27 data will silently serve as fallback in 2027-28.

**Refresh coverage**
- Pull-to-refresh only on Home; `/today`, `/calendar`, `/announcements`, `/more/athletics`, `/more/menu` have none.
- The 30s AppShell poll covers `/api/data` + schedule but NOT `fetchLiveEvents`/`fetchWeekly` (fetched once on mount).
- Calendar page has no loading/offline state (renders "No upcoming events." while loading and when the proxy is down); announcements/athletics both handle this.

**Notices placement list** (`config/noticePages.ts`)
- Missing `/more/faith/prayers` and `/announcements/read` (both reachable). Offers `/more/hall-pass` (unreachable).

## Tier 3 — Design consistency

**High (broken/inaccessible)**
- `admin/map/page.tsx:364`: white text on gold, ~2.2:1 contrast. Kit's gold variant uses anthracite.
- `admin/map/page.tsx:386-393`: `<span role="button">` nested inside a real button; invalid, not keyboard-reachable, 32px target.
- `admin/schedule/page.tsx:206,209`: `!min-h-0` produces 24-28px inputs on touch.
- "Back to today" (`calendar:148`, `admin/schedule:551`) and the map A-Z rail (`admin/map:407`) are far under 48px; add `.tap-expand`.
- Banned footer explainers: `more/privacy/page.tsx:95-97`, `AdminGate.tsx:84-86` (also `admin/school/page.tsx:66-68` in miniature).

**Medium (visible drift)**
- Hand-rolled `Field`/`TextInput` copies in settings, more/schedule, parent, Onboarding, more/map (5 sites, 2 with drifted spacing). Route through the kit.
- Ad-hoc empty states in calendar, athletics, admin/athletics, admin/schedule vs `EmptyState` everywhere else.
- `StatusBadge` (hall-pass) reimplements `Pill`; add a `danger` Pill tone instead.
- 15 call sites hand-override Button padding two different ways; add `size="sm"` to Button.
- Segmented controls built three different ways (announcements, menu, home); selection chips two ways; form labels three ways. Extract `Segmented`, unify chips on gold-tint, route labels through `Field`.
- Date-stepper + month modal duplicated verbatim between calendar and admin/schedule; extract `DayStepper`.
- Faith parchment card: 5 hardcoded hexes, no dark handling, off-palette red (`more/faith/page.tsx:25-35`).
- Contacts hand-rolls `LinkButton variant="outline"` and `EmptyState` markup.
- `DemoBanner` ad-hoc chip button.

**Low**
- `space-y-5` vs the standard `space-y-4` on 7 pages; `rounded-[10px]` one-off; redundant `min-h-[48px]` alongside `.tap`; missing BackLink on `portal/set-password`; unpaired `text-gold` icon on ETV; small muted explainers inside cards on share/settings/menu.

**Healthy:** dark-mode token discipline (every `text-royal` theme-paired), danger variant used for all destructive actions, Pill/Spinner/SectionTitle/BackLink adoption on More subpages complete. Clean pages needing nothing: `/`, `/today`, `/calendar` (data-wise), `/announcements`, `/more/clubs`, `/more/faith/prayers`, `/more/map`, `/parent`, `/more/settings`, `/more/share`, `/more/privacy`.

---

# Remediation — completed same day

All tiers addressed (backbone by orchestrator, Tier 2 + Tier 3 + server hardening by Opus agents). Final build: 38 routes, tsc clean.

**Removed:** hall pass (all surfaces, store, server API, stored PII file), security portal role, ETV page + fake provider, dead games subsystem, on-device day-type overrides, fabricated scraper values (security phone, clubs contact).
**Now server-synced (were device-local):** School Info & Links overrides, admin calendar events.
**Honesty fixes:** offline/cold-start shows "Schedule unavailable" instead of invented Regular Day; dining hours show "Hours unavailable" instead of a fabricated range; safety page shows an honest fallback instead of a hardcoded number.
**Tier 2:** edit UIs for announcements + calendar events, live-calendar event editing for ALL categories, athletics past toggle, passcode management, map hide/restore, calendar tri-state + venue badge, pull-to-refresh on all live pages, school links/attendance/security server-owned via SchoolOverrides, main office + parent liaison in the editable contacts directory, parent schedule import, contacts hide.
**Tier 3:** Button size prop + Pill danger + Segmented + DayStepper extracted; contrast, nested-button, and touch-target fixes; footer explainers removed; kit adoption across 20+ files; spacing/radius unified.
**Scale (6000 users):** all client fetches proxy-only (verified); proxy single-flight + serve-stale caching; /api/data served from memory with precomputed ETag; jittered client polls.
**Security:** per-IP auth rate limiting, timing-safe compares, hashed session tokens, security headers, CORS lockdown via env, payload caps, generic client errors, env-gated test accounts, crash resilience, orphaned PII deleted.

## Deployment checklist (school servers)
- Set `SMTP_HOST/PORT/USER/PASS/FROM` — REQUIRED. Without SMTP, password-setup links are returned in the HTTP response (demo mode) = anyone guessing a staff email gets a working setup link.
- Set `CALENDAR_API_KEY` (BellCalSync primary source).
- Leave `ALLOW_TEST_ACCOUNTS` and `NEXT_PUBLIC_TEST_ACCOUNTS` UNSET (test accounts compile out / allowlist empties).
- Optionally set `ALLOWED_ORIGIN` to the app origin — but verify Capacitor shells first (they send capacitor://localhost / null origins).
- Rate limiter is per-process; fine single-instance, multiplies if run multi-instance.

## Known deferred items
- Lunch-track building map is static config while the menu page shows the live chart (audit item; deferred as invasive — schedule engine reads it synchronously).
- Bell-schedule templates are 2026-27 without a year stamp; mitigated by the honest unavailable state (templates now only surface via admin day editing, never as silent fallback).
