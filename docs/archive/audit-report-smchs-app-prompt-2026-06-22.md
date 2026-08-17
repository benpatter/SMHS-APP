# Site Audit — SMCHS App build spec (`PROMPT.md`)
**Auditor:** Marcus Reyes (SMCHS junior, your honest test user)
**Date:** 2026-06-22
**Role tested:** student (user) — there's no live site yet, so I audited the *feature spec* as the kid who'd actually use it
**Endpoints walked:** N/A — this is the build prompt, not a deployed app. I read it the way I'd judge the app it produces.
**Focus notes:** "align with student needs, give features students will actually use, make it easy to use"

---

## TL;DR
The core instinct is dead right — the live "time left in this period" countdown is the hero, and that's literally the one feature that made the student app a thing. Where the original spec was off: it made me **enter my whole schedule before I could even see the bell schedule** (instant bounce), it buried the **home-screen widget** and **notifications** as "optional," and it skipped the stuff students actually open a school app for — **checking grades**, a **"what do I need on the final" calculator**, and a fast answer to **"is tomorrow a block day?"** I reworked the prompt to fix all of that. With those changes, yeah, I'd use this every day.

---

## Per-endpoint findings (audited as feature areas)

### Onboarding — *user*
**First impression:** Original made grad year + name + *build a schedule* the gate. Entering 7–8 classes before seeing anything? I'd close it.

**👍 Likes**
- No accounts/passwords, on-device only — I don't want to make a login for my own bell schedule.

**🔧 Should change**
- Onboarding · schedule entry · user — **don't block the app on it.** Fixed in the prompt: grad year + optional name, under 30 seconds, then you're in. Schedule is an optional later step, one period at a time.

**Usefulness verdict:** Good now — fast and skippable. Before, it was the #1 bounce risk.

### Home / bell schedule + countdown — *user*
**👍 Likes**
- Countdown as the hero, current + next period, day-type auto-driven by the calendar. This is the whole reason to open the app.

**🔧 Should change**
- Home · between-classes state · user — original countdown only covered "time left in period." Added a **passing-period countdown** ("Period 3 starts in 4:32 · Room 215") so it's never blank, plus **"school's out in"** and today's day type without a tap.

**⚠️ Missing functionality**
- "What kind of day is it?" · user — students ask "is tomorrow block/late-start/minimum?" constantly. Added a glanceable next-few-days day-type strip.

**Usefulness verdict:** The strongest part. Now it actually covers the whole school day, not just mid-class.

### Personal schedule — *user*
**🔧 Should change**
- Entry friction · user — made it explicitly fast, one-period-at-a-time, partial schedules OK. Added **mark a period as free/off** (real thing — not everyone has a full day).

**Usefulness verdict:** Solid once entry is painless. The custom period names are exactly right.

### Grades (Aeries) — *user*
**⚠️ Missing functionality**
- Grades were buried as "mocked for now," but this is a **top reason students open a school app** — we refresh Aeries obsessively. Bumped it up, added **notify-on-new-grade** (once the real provider's live), and a **"what do I need on the final" what-if/GPA calculator** that works fully offline on numbers I type in. That calculator alone will get daily use.

**Usefulness verdict:** Was underweighted; now it's a headline feature where it belongs.

### Assignments feed (Teams) — *user*
**🗑️ Cut or rework**
- Original said "mocked for now." Showing a **fake assignments list as if it's real** is how an app loses me — I'll catch it and stop trusting everything else. Reworked to an honest "connect your account" empty state until the real Graph feed is wired up.

**Usefulness verdict:** Fine *if* it's real or clearly empty. Never fake.

### Widget + notifications — *user*
**⚠️ Missing functionality**
- Both were "optional." The **home/lock-screen widget with the countdown** is the single most-loved surface — seeing time-left without opening anything. Made it core. Added **opt-in, easy-to-silence** notifications (announcements, optional class-change nudges, new-grade alerts) — with a warning that an app that over-pings gets muted forever.

**Usefulness verdict:** This is the difference between "nice app" and "app on my home screen."

### Nice-to-haves — *user*
**👍 Likes**
- Added **share/compare your schedule with a friend** via offline QR/link ("do we have lunch together?") — students love this and it fits the no-server rule. Kept athletics scores as a real option (sports-heavy school).

---

## Overall verdict
**Would I use this?** Yes — daily — now that the countdown covers the whole day, grades are front-and-center, and I'm not forced to type my whole schedule to get in.
**Biggest single fix:** Don't gate the app behind schedule entry. Show the bell schedule + countdown immediately. (Done.)
**Scope check:** Right amount now. The cuts (no fake assignments, widget/notifications promoted instead of new bloat) keep it a tight daily utility, not a feature dump.
**Admin vs. user balance:** This is a student-first product; admin (staff announcement panel) is correctly kept optional and out of the student's way.
**Top 3 things to fix first:**
1. Onboarding — under 30s, schedule optional/skippable (Home + countdown visible before any class entry).
2. Make the widget + notifications core, not optional.
3. Grades front-and-center + the "what do I need on the final" calculator.
