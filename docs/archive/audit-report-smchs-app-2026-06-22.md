# Site Audit — SMCHS App (http://localhost:3100)
**Auditor:** Marcus Reyes (SMCHS junior, your honest test user)
**Date:** 2026-06-22
**Role tested:** user (student) — onboarded as Class of 2027 / Grade 11
**Endpoints walked:** 13 — `/`, `/announcements/`, `/calendar/`, `/more/`, `/more/schedule/`, `/more/grade-calculator/`, `/more/attendance/`, `/more/assignments/`, `/more/etv/`, `/more/athletics/`, `/more/share/`, `/more/settings/`, `/more/about/` (+ the Grades→Aeries hand-off)
**Focus notes:** would a real SMCHS student actually use this daily? brand fidelity (royal blue + vegas gold, no red)? anything broken/missing/cut?

---

## TL;DR
Ngl, this is the one. The home screen opens straight to the live "Period 3 ends in 11:29" countdown — no login wall, no "build your whole schedule first" nonsense — and that's literally the only thing I open a school app for. It's fast, it looks like *our* school (deep royal blue + that antique gold, zero of the random color-swapping the old app does), and the stuff that usually fakes me out — assignments, grades — is handled honestly instead of with fake data. I clicked through every page and tried to break things; nothing threw an error in my face, the math on the grade calculator is actually right, and the period-8 toggle really does hide period 8 everywhere. A couple small nitpicks, but I'd put this on my home screen today.

---

## Per-endpoint findings

### `/` — Home / live countdown — *user*
**First impression:** Instant. Big royal hero card, "REGULAR" day-type tag, "Period 3 ends in 11:29" in gold, "Up next: Period 4 · starts 10:55 AM," and "School's out in 5:21:29 (4:00 PM)." I understood the whole screen in two seconds. This is the app.

**👍 Likes**
- Home · countdown hero · user — the countdown ticks live every second and it's legible from across the room. Exactly what made the student app a thing.
- Home · "what's next" + "school's out in" · user — answers the two follow-up questions without a tap.
- Home · day-type strip · user — "Today Regular / Tue Block A / Wed Block B / Thu Late Start / Fri Rally" right there. The "is tomorrow a block day?" question, solved.
- Home · "Add your classes" nudge · user — it's a dashed optional card, not a gate. I added one class and the countdown switched to "AP Biology ends in 12:57 · 215." Love that it gets personal as you fill it in.
- Home · Quick Access · user — Grades, Final Calc, My Schedule, Absent?, Bell Schedule all one tap away.

**🔧 Should change**
- Home · passing-period state · user — I couldn't catch it live during the audit (I was mid-period the whole time). Couldn't verify the "Period 3 starts in 4:32" flip in person — devs should double-check it on a real passing period, since it's a headline feature.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** The whole reason to install the app. Perfectly scoped.

### `/announcements/` — Campus Life — *user*
**First impression:** "CAMPUS LIFE" with a "GRADE 11" tag — it knew my grade from onboarding and filtered to Campus Life 11 + All-School. No grade 9/10/12 noise.

**👍 Likes**
- Announcements · grade filtering · user — only my channel + all-school. Clean.
- Announcements · honesty banner · user — "Showing sample announcements. The live feed connects to the Microsoft Teams Campus Life channels once the school enables it." This is the right way to ship mock data — tell me it's mock.
- Announcements · "Open in Teams →" · user — real Teams links.

**🔧 Should change**
- Announcements · timestamps · user — "2h ago / 3h ago / Yesterday" are nice; just make sure they stay sane once the real Teams feed is wired (relative time off a real post date).

**⚠️ Missing functionality** — Nothing here (assignments/grades are correctly elsewhere).

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Worth it and well-scoped. The grade filter is the differentiator.

### `/calendar/` — One calendar + bell schedule + day types — *user*
**First impression:** Date navigator at top, "Bell Schedule" for the day, then "Upcoming Events." Tapped the arrow to Tue Jun 23 and it flipped to "Block Day (1–4)" plus that day's "Eagle Rally" event. The single calendar actually drives the day type — exactly the thing they said they were fixing.

**👍 Likes**
- Calendar · day navigator · user — prev/next works, "Back to today" shows up when you wander off. Tapping an upcoming event jumps the view to that day.
- Calendar · one calendar · user — schedule + events + day type in one place. No "two calendars" mess.
- Calendar · event category tags · user — Athletics / Arts / Ministry / Campus Life / Holiday, color-tagged in brand colors.

**🔧 Should change**
- Calendar · month jumping · user — you can only step one day at a time. Fine for "what's tomorrow," but if I want a date three weeks out I'm tapping a lot. A month grid or a "jump to date" would help. Minor.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Solid and correctly the single source of truth for day types.

### `/more/` — Hub — *user*
**First impression:** Profile card (my name + Class of 2027 · Grade 11), a big gold Grades button, then tidy grouped lists (Your Day / School / Help / App). Easy to scan.

**👍 Likes**
- More · grouping · user — clear sections, every row has an icon + subtitle. Not a dumping ground.
- More · Grades up top · user — prominent, where I'd reach for it.

**🔧 Should change** — Nothing major.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Good hub, right amount of stuff.

### `/more/schedule/` — My schedule editor — *user*
**First impression:** Periods 1–8 listed, "Tap to add" on empties. Edited Period 1 → typed "AP US History" → Save. Marked Period 2 as a free period via the checkbox. Both stuck.

**👍 Likes**
- Schedule · one-period-at-a-time · user — no wall of required fields. I added exactly what I wanted and bounced. Partial schedule totally fine.
- Schedule · free period · user — "Free Period" shows and the name/room fields gray out. Real feature for people with off periods.
- Schedule · persistence · user — my class survived navigating away and even a period-8 toggle change.

**🔧 Should change**
- Schedule · teacher field · user — it's there but optional, which is right; no complaint, just confirming it's not forced.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Painless entry, which is the whole point. Nailed it.

### `/more/grade-calculator/` — "What do I need on the final?" — *user*
**First impression:** Two calculators sharing "current grade" + "final weight." Typed 88 / 20% / target 90 → "You need to score **98.0%**." That's correct math. Set the score field to 85 → "Your overall grade would be **87.4%**." Also correct.

**👍 Likes**
- Calc · the math · user — I checked it by hand, it's right. (88×0.8 + need×0.2 = 90 → 98%.)
- Calc · unreachable target · user — bumped target to 100 and it said "148.0% — That's above 100% — this target isn't reachable on the final alone." Handles the edge instead of just printing a dumb number.
- Calc · honesty · user — "Nothing is saved or sent anywhere — your real grades live in Aeries." No fake gradebook.

**🔧 Should change**
- Calc · letter grades · user — students think in letters (A-/B+), not just %. Showing the matching letter next to the % would make it even more useful. Nice-to-have.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** This gets daily use in finals season. Genuinely good.

### `/more/attendance/` — Report an absence — *user/parent*
**First impression:** Big royal "Call (949) 766-4000" and gold "Email attendance@smhs.org" buttons, then the procedure and office hours.

**👍 Likes**
- Attendance · tap-to-call / tap-to-email · user — verified the real hrefs: `tel:+19497664000` and `mailto:attendance@smhs.org?subject=Student%20Absence`. The pre-filled subject is a nice touch.
- Attendance · honesty · user — footnote says the contact details are placeholders pending the school. Good.

**🔧 Should change**
- Attendance · email button icon · user — the Email button uses the *megaphone* icon. Reads weird; should be an envelope/mail icon. Tiny, but I noticed instantly.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Exactly what a parent needs, fast. Just fix the icon.

### `/more/assignments/` — Teams assignments — *user*
**First impression:** "Connect your school account" empty state. No fake deadlines.

**👍 Likes**
- Assignments · honest empty state · user — "We won't show placeholder due dates — only the real thing." This is the move. The second a school app lies about a due date I stop trusting all of it; this doesn't.

**🔧 Should change**
- Assignments · the "Open Microsoft Teams" button · user — it opens Teams, but it doesn't actually *connect* anything yet (the page admits sign-in comes later). Fine for now, just make sure the button doesn't feel like it should've logged me in.

**⚠️ Missing functionality** — Real Graph sign-in isn't wired yet — but that's disclosed, not hidden, so it's a roadmap item, not a lie.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Correctly a placeholder done the honest way. Worth keeping as the shell.

### `/more/etv/` — Eagle TV gallery — *user*
**First impression:** Clean video gallery, brand-blue thumbnails with a play glyph and durations, "Sample listing" banner, "SOURCE PENDING" tags on episodes.

**👍 Likes**
- ETV · honest thumbnails · user — placeholder tiles instead of fake screenshots, and it says playback connects when the source is wired. No lying.
- ETV · layout · user — looks like a real video gallery, not a list of dead links.

**🔧 Should change** — Nothing major.

**⚠️ Missing functionality** — Actual playback (disclosed as pending).

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Fine as a shell; will be genuinely nice once the real feed drops.

### `/more/athletics/` — Scores & schedules — *user*
**First impression:** Eagle logo (correct — spirit context), Upcoming games + Recent Results with W/L and scores. "Sample schedule" banner.

**👍 Likes**
- Athletics · Eagle mark used here · user — they kept the Eagle logo to athletics/spirit only, SM mark everywhere else. Someone read the brand book.
- Athletics · W/L badges · user — "W 2–1" / "L 58–63" and — I checked — the L is gray, NOT red. They actually held the "no red" rule even where it'd be tempting.

**🔧 Should change**
- Athletics · scope · user — sports-heavy school, so this earns its spot, but it's the most "filler-risk" page until the live feed is real. Keep it behind the honest banner.

**⚠️ Missing functionality** — Live scores (disclosed).

**🗑️ Cut or rework** — Nothing here, but it's the first thing I'd cut if scope ever needs trimming.

**Usefulness verdict:** Nice-to-have that fits the school. Lower priority than the daily-driver pages.

### `/more/share/` — Share/compare schedule — *user*
**First impression:** A royal-blue QR code of my schedule + a "Share link" button. Then I opened a crafted friend's link (`?s=...`) and it showed "SHARED SCHEDULE — Jordan / Classes you share: ✓ Period 1: AP US History."

**👍 Likes**
- Share · no server · user — the whole schedule is encoded in the URL. Scan or send, no account, works offline. Exactly the "do we have lunch together?" thing and it actually computed the shared period correctly (ignored my free P2 and their P3-only).
- Share · import · user — "Import as my schedule" button is right there for the "just give me yours" case.
- Share · empty-state guard · user — before I had any classes it said "Add classes first," which is the right gate.

**🔧 Should change**
- Share · "Share link" feedback · user — on desktop with no native share sheet it copies the link; make sure the "Link copied!" confirmation is obvious on a real phone (it uses the native share sheet there, which is fine).

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Genuinely fun and it works. Students will actually use this.

### `/more/settings/` — Settings — *user*
**First impression:** Profile (name + class year), Show Period 8 toggle, Appearance (Light/Dark/System), Notifications (3 opt-in toggles), and a red "Reset all app data."

**👍 Likes**
- Settings · Period 8 toggle · user — flipped it off, went to Home: Period 8 was gone from the schedule, Period 7 stayed, my custom class survived. It really does hide everywhere.
- Settings · dark mode · user — switched to Dark and it's a deep blue-black that *keeps* the royal/gold identity instead of going generic gray. Looks intentional.
- Settings · notifications opt-in · user — all default-off-ish and clearly labeled "we keep notifications quiet by default." A school app that over-pings gets muted forever, so this is the right call.
- Settings · destructive guard · user — "Reset all app data" is the only red thing in the app (correct — it's genuinely destructive) and it pops a "Yes, reset everything / Cancel" confirm instead of nuking instantly.

**🔧 Should change**
- Settings · notification reality check · user — the toggles ask for OS permission but real push isn't fully wired yet (it's a PWA). Just make sure enabling one doesn't imply pings that won't arrive yet.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Complete and safe. The Period 8 toggle and quiet-by-default notifications show they get students.

### `/more/about/` — About / transparency — *user*
**First impression:** SM mark, school info, then a "Data sources" list literally labeling each feed LIVE vs SAMPLE/MOCK, a "pending confirmation with the school" list, and the brand swatches with hex codes.

**👍 Likes**
- About · data-source honesty · user — Campus Life = SAMPLE/MOCK, Assignments = SAMPLE/MOCK, Grades & Bell schedule = LIVE. It tells you exactly what's real. Respect.
- About · brand swatches · user — #1A4784 / #B4A365 / #282828 and a "no red in the palette" note. Whoever built this is building to the actual brand guidelines.

**🔧 Should change** — Nothing major.

**⚠️ Missing functionality** — Nothing here.

**🗑️ Cut or rework** — Nothing here.

**Usefulness verdict:** Most people won't open it, but the honesty here is a great signal. Keep it.

### Grades → Aeries hand-off — *user*
**First impression:** Tapped "Grades." It fired the Aeries Mobile Portal app scheme, then fell back to `aeriesportal.smhs.org` (the page title confirmed the fallback). No fake gradebook, no scraping — one tap, hand off, done. (It only errored out because this test machine has no network to actually load Aeries.)

**👍 Likes**
- Grades · deep link + web fallback · user — exactly the "open the real Aeries app, fall back to web" behavior. This is the right way to do grades.

**Usefulness verdict:** Perfect. Don't rebuild grades in-app — this is correct.

---

## Overall verdict
**Would I use this?** Yes — daily. The countdown is the hero, it opens instantly with no wall, it looks like the actual school, and it doesn't lie to me anywhere. That combo is rare.

**Biggest single fix:** Honestly there's no blocker. The most valuable *verification* item: confirm the passing-period countdown flip ("Period 3 starts in 4:32") looks right on a real passing period — I was mid-class the whole audit so I couldn't catch it live. After that, it's polish.

**Scope check:** Right amount. The daily-driver stuff (countdown, schedule, day types, grades, calendar, attendance) is front and center; the nice-to-haves (ETV, athletics, share) earn their place and are honestly labeled as sample where not live. Nothing felt like Straxis-style filler.

**Admin vs. user balance:** This is a student-first product and it knows it. No student-facing admin clutter; the staff announcement panel correctly isn't in my way. Good call.

**Top 3 things to fix first:**
1. Verify the passing-period + "school's out" countdown states live on a real passing period and after dismissal (`/` — countdown). It's the headline feature; just confirm the in-between states.
2. Swap the megaphone icon on the Email button for a mail/envelope icon (`/more/attendance/`). Tiny, but it reads wrong.
3. Make sure notification toggles don't promise pings that aren't wired yet, and the "Link copied!" confirm is visible on real phones (`/more/settings/`, `/more/share/`). Polish, not bugs.
