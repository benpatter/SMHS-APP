# Build Prompt — Santa Margarita Catholic High School App ("SMCHS App")

You are building a cross-platform app for **Santa Margarita Catholic High School (SMCHS)**, Rancho Santa Margarita,
CA — for students and parents. Read the context, then build the app described by the feature list. Use your judgment
on architecture, sequencing, and details; the lists below are intent, not rigid spec.

## What to build
**One website that ports to iOS and Android** from a single codebase, also installable as a PWA.

Stack (required):
- **Next.js (App Router, React, TypeScript)** for web + PWA.
- **Capacitor** to wrap the same build into native **iOS and Android** apps.
- **Tailwind CSS** with a small consistent component layer.
- **Local-first / offline:** user profile, schedule, and cached content live on-device (IndexedDB/Dexie or
  localStorage). Core schedule features work fully offline. **No server-side accounts or password auth.**
- Handle the America/Los_Angeles timezone explicitly with a real date/time library.

## Context — why this exists
SMCHS currently has TWO apps, and the split causes the problems:
- An old **Straxis/u360mobile** app: slow, dependent on the Straxis server, inconsistent branding (logo and colors
  change between days), two separate calendars, and dead/unused content.
- A student-built app students LOVE for its **live "time left in this period" countdown**, **custom period names**,
  and **grade viewing**. Match or beat that experience.

We are replacing the mess with ONE clean, fast, trustworthy app. Relevant institutional facts: SMCHS is a Microsoft
Showcase School, standardizes on Microsoft 365, **every class has a Team**, grade-level **"Campus Life"**
announcements (grades 9/10/11/12) live in Teams channels, and grades live in **Aeries**.

The two things this app must feel like a continuation of:
1. **The official SMCHS web presence (smhs.org).** It is a polished, photography-forward Finalsite site: a clean
   sans-serif UI, card-based news/event tiles, a multi-level institutional nav (About · Admissions · Academics ·
   Arts · Athletics · Campus Life · Mission & Ministry) with a utility strip (Parent Portal / FACTS), and the
   royal-blue-and-gold Eagles identity. Diocese of Orange, IB World School. The app should read as an *official
   school product* from the same institution — same color discipline, same restraint, same vocabulary ("Campus
   Life," "Athletics," "Eagles").
2. **The student-built app students already love.** Utilitarian and instant. Its signature is the **live "time left
   in this period" countdown**, **custom period names**, and **quick access to grades**. The new app should keep that
   fast-utility soul — the countdown is the hero of the home screen, and grades are one tap away (handed off to the
   Aeries app, not rebuilt in-app) — while wrapping it in the official brand.

## Users
- **Students (primary):** what they actually open the app for, many times a day — *"how long until this class is
  over?"*, *"what room/class do I have next?"*, *"is tomorrow a block/late-start day?"*, *"what are my grades / what
  do I need on the final?"*, and *"what's going on at school (announcements/events)?"* Design every default for the
  glance-while-walking-between-classes case: one look, answer, done.
- **Parents (secondary):** attendance/absence contacts, calendar, announcements.

## Lightweight local profile (the "login")
- First-launch onboarding is **under 30 seconds and never blocks the app**: pick **graduation year** (derives grade
  level for announcements), optional name. That's it — you're in.
- **Do NOT gate the app behind entering a full schedule.** A student should see today's bell schedule and the live
  countdown immediately, before adding a single class. Adding/personalizing their own classes is an *optional next
  step* they can do later from the home screen or settings, one period at a time, and the countdown gets more
  personal as they fill it in. Entering all 7–8 classes up front is exactly the kind of friction a student bounces on.
- Stored **only on-device** — no accounts, no central server holding schedules. Editable anytime; resettable.

## Features to include
- **The home screen answers "how much longer?" in one glance — this is the whole app.** Big, unmissable **live
  "time left in this period" countdown** for the current period, with the current class name/room and **what's next
  (next class + room + start time)** right under it. Between classes, the countdown flips to a **passing-period
  countdown** ("Period 3 starts in 4:32 · Room 215") so it's never blank. Also surface, without a tap: **today's day
  type** (regular/block/late-start/rally/finals/minimum), and **when school is out** ("School's out in 2:14"). This
  is the screen a student stares at fifty times a day — make it instant, legible from across a hallway, and correct.
- **"What kind of day is it?" at a glance.** Students constantly ask whether tomorrow is a block day, late-start, or
  minimum day. Make the day type obvious for today and **glanceable for the next few days** (e.g. a small strip).
  One tap to the full day's bell schedule; easy switching between day types. Support nutrition/break and lunch.
- **Personalized / pluggable class schedule, made painless to enter.** User adds their own classes per period
  (course name, room, optional teacher) and can **rename periods** ("Period 1" → "AP Bio"); the countdown then shows
  *their* class ("AP Bio ends in 12:43"). Entry must be **fast and one-period-at-a-time** — never a wall of required
  fields, and partial schedules are fine. Let a student **mark a period as a free period / off** (and the countdown
  treats it as free time). Survives offline and restarts; easy to edit anytime.
- **Period 8 on/off switch** in settings that hides/shows period 8 everywhere (many students don't have one).
- **One single calendar** (eliminate the "two calendars" problem). School events plus which bell schedule each day
  uses; it drives the home screen's day type automatically.
- **Campus Life announcements by grade.** Feed showing the user's grade channel (9/10/11/12, from grad year) plus
  all-school. **Architect for real Microsoft Teams / Graph integration** (read the Campus Life channels) but build
  now with **mock/seed announcements behind a swappable `AnnouncementProvider` interface**; optionally deep-link to
  the Teams app. Support notifications for new announcements.
- **Assignments feed from Teams.** Read-only upcoming assignments/deadlines, behind a provider interface for
  Microsoft Graph (class Teams → Assignments). **Don't show a fake assignments list as if it were real** — students
  stop trusting an app the moment they catch it lying. Until the real feed is wired up, show an honest "connect your
  school account to see assignments" empty state rather than mock data dressed as live deadlines.
- **Attendance — "I'm absent, who do I contact?"** A prominent button stating the absence-reporting procedure and
  the correct phone/email (parent-facing, tap-to-call / tap-to-email). Config-driven contacts.
- **ETV** — rename today's "video list" to **ETV** (Eagle TV): a clean video gallery from the school's existing
  source.
- **Grades — just open Aeries.** Students check grades in **Aeries**, so don't rebuild a gradebook in-app. Provide a
  prominent **"Grades" button that opens the Aeries app** (deep-link to the installed Aeries Mobile Portal, falling
  back to the Aeries web portal in the browser if the app isn't installed). No in-app grade viewing, no mock grades,
  no scraping — one tap, hand off to Aeries. Make the button obvious since it's something students reach for often.
- **Home-screen / lock-screen widget with the live countdown — treat as core, not optional.** The single most
  student-loved surface is the countdown *without even opening the app*. Ship a widget (and/or live-activity-style
  surface where the platform allows) showing current period + time left. Plan it from the start.
- **Notifications that respect a student's day:** new announcements for their grade and optional class-change nudges
  ("Period 3 starts in 5 min — Room 215"). All opt-in and easy to silence — a school app that over-pings gets its
  notifications turned off and never turned back on.
- Optional, only if they earn their place: **share/compare your schedule with a friend** via an offline-friendly
  QR code or link ("do we have lunch/this period together?" — no server, just encode the local schedule),
  athletics scores/schedules (it's a sports-heavy school), a staff admin panel to post announcements without code,
  directory/maps.

## Get rid of / avoid
- The **two-calendar** situation — exactly one calendar.
- **Reliance on the Straxis server** (or any single third-party server) for core schedule features.
- **Inconsistent branding** — branding and layout must look **identical on every launch**, no random color/logo
  changes. One fixed theme config as the single source of truth.
- **Dead/useless content** and legacy Straxis-style padding modules.
- **Slow loads** — the app shell and schedule must render instantly from local cache with no network.
- No server-side accounts or password auth; no public endpoint exposing schedules.

## Design direction — look like SMCHS, not like an AI template
The goal: a stranger should believe this app was made *by Santa Margarita Catholic High School* — a sibling to
smhs.org and an evolution of the student app — not generated from a prompt. Match the real brand exactly; do not
invent a "school-ish" look.

**Exact brand colors (from the official 2017 SMCHS Brand Guidelines — these are the single source of truth, not
"navy/red/gold"):**
- **Royal Blue** — Pantone 287 · RGB 26,71,132 · **`#1A4784`** — the dominant brand color (headers, primary actions,
  active states). This is a deep royal blue, *not* a generic Tailwind blue/indigo.
- **Vegas Gold** — Pantone 4515 · RGB 180,163,101 · **`#B4A365`** — the accent (highlights, the live-countdown
  emphasis, selected period). A muted antique gold, *not* bright yellow.
- **Anthracite Gray `#282828`**, **Light Gray `#999999`**, **White `#FFFFFF`** — the neutral system for text,
  surfaces, and dividers.
- There is **NO red** in the SMCHS palette. Royal blue + vegas gold on white/gray is the entire identity. Reserve
  any red strictly for genuine error/destructive states, never as a brand accent.

**Logos (follow the brand book's rules):**
- Use the **SM Logo** (the "SM" mark with the **white cross in the "M"** — the cross is mandatory and never black)
  as the app's institutional mark: launch icon, top of the home screen, onboarding. This is the official/academic
  identifier.
- Use the **Eagle Logo** only in athletic/spirit contexts (e.g. an athletics tab, ETV spirit content) — never as the
  primary academic identifier. Ship clean SVG placeholders that respect these rules until the school supplies the
  real high-res assets from `www.smhs.org/smchsgraphics`.

**Typography (mirror the brand + the website):**
- Headlines / the institutional wordmark: a **classical serif in caps** in the spirit of **Trajan Pro** (the school's
  display face) for the SMCHS name and major section titles — this single touch reads "established Catholic school,"
  not "startup." Use a freely-licensed Trajan-like serif (e.g. Cinzel) or fall back to a clean serif; keep it sparing.
- UI / body: a **plain, legible sans-serif** matching smhs.org's clean web type and the brand's Arial/Calibri
  standard (system UI stack or Inter/Source Sans). Dense, readable, utilitarian — the student-app feel.
- Do not use rounded "friendly" display fonts, handwritten fonts, or decorative gradients in type.

**Layout & feel — echo smhs.org and the student app, avoid the AI-template tells:**
- The home screen leads with **today's schedule and the live period countdown as the hero** (the student-app soul),
  rendered in the official brand — not a marketing splash.
- Borrow smhs.org's **card-based tiles** for announcements/events and its institutional vocabulary ("Campus Life,"
  "Athletics," "Eagles," "Mission & Ministry"), but keep the chrome tight and app-like, not website-like.
- **Avoid the generic-AI tells:** no purple/indigo gradient hero, no emoji-as-icons, no identical rounded-2xl drop-
  shadow cards everywhere, no centered three-column "feature grid," no glassmorphism, no filler marketing copy.
  Favor flat fills in royal blue/gold, hairline gray dividers, square-ish corners, and real content density.
- Real content states everywhere: loading, empty, error, offline — these are the parts an AI mockup skips and the
  parts a real school utility lives in.

**Non-negotiables:**
- Accessibility: WCAG AA contrast (verify gold-on-white and blue-on-gold pairings), large tap targets, respects
  system font scaling, dark mode that keeps the royal-blue/gold identity.
- Consistency is a feature: predictable bottom-tab navigation (e.g. Home/schedule · Announcements · Calendar · More),
  **identical look every launch** — one fixed theme config as the single source of truth (directly fixing the old
  Straxis app's day-to-day logo/color drift).

## Architecture notes
- **Offline-first & instant**: schedule logic runs entirely on-device; network only refreshes
  announcements/calendar/ETV with cached fallback.
- **Config-driven content**: bell schedules, day-type calendar, attendance contacts, and announcement sources come
  from versioned config/JSON so non-developers can update them and you can ship with seed/mock data.
- **Swappable providers**: define `AnnouncementProvider` and `AssignmentProvider` interfaces with mock
  implementations now and a documented `TeamsGraphProvider` stub for later real hookup. Grades are **not** a provider
  — they're a deep-link out to the Aeries app, so there's no in-app grades data layer to build.
- Verify the same build runs as PWA, iOS (Capacitor), and Android (Capacitor), and works offline for core schedule.

## Before relying on placeholders, confirm with the school
The brand colors and logo rules above are taken from the official SMCHS Brand Guidelines and should be treated as
final — build to them now. Still confirm with the school: the **high-res SM/Eagle logo assets**
(`www.smhs.org/smchsgraphics`), exact **bell-schedule times and day types**, the **ETV video source**, and the
**attendance phone/email**.
