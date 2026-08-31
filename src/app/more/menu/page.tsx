'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDining, type DiningInfo } from '@/lib/providers/live';
import {
  DINING_GUIDELINES_DEFAULT,
  DINING_HOURS_DEFAULT,
  DINING_LUNCH_DEFAULT,
  DINING_MENU,
  DINING_URL,
  MENU_SECTIONS,
  type MenuItem,
  type MenuSection,
} from '@/config/dining.seed';
import { effectiveDining, effectiveDiningItems } from '@/lib/store';
import { mailtoHref } from '@/lib/links';
import { useMounted, useNow } from '@/lib/hooks';
import { useAppStore, useViewerGradYear } from '@/lib/store';
import { lunchForDay } from '@/lib/scheduleEngine';
import { scheduleFor } from '@/lib/calendar';
import { currentSchoolYearStart } from '@/lib/schoolYear';
import { gradeFromGradYear } from '@/lib/types';
import type { DateTime } from '@/lib/time';
import type { LunchTrack } from '@/lib/types';
import { BackLink } from '@/components/BackLink';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PaymentBadges } from '@/components/PaymentBadges';
import { Card, LinkButton, Segmented, cx } from '@/components/ui';
import { MailIcon, ClockIcon } from '@/components/icons';

/** "7:00 AM" → minutes since midnight, for the open/closed dot. */
function toMinutes(t: string): number | null {
  const m = t.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

/**
 * The student's own lunch for the given day, resolved by the same engine the
 * bell schedule uses: a lunch they set by hand wins, then science → 1st, then
 * the building of that day's DECIDING block — which is Period 3 on a Regular
 * day but Period 2 on a Meeting day and Period 4 on an All-Periods day. This
 * used to read Period 3 flat, so an override set on any other day type was
 * honored on the schedule and ignored here.
 */
function useMyLunch(now: DateTime): LunchTrack | null {
  const personal = useAppStore((s) => s.schedule);
  const gradYear = useViewerGradYear();
  // Re-resolve when an admin day edit or the live schedule changes, exactly as
  // BellScheduleView does — a day can hand lunch out by grade instead.
  const live = useAppStore((s) => s.liveSchedule);
  const serverData = useAppStore((s) => s.serverData);
  const day = now.toFormat('yyyy-MM-dd');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sched = useMemo(() => scheduleFor(now), [day, live, serverData]);
  const grade = useMemo(() => gradeFromGradYear(gradYear, currentSchoolYearStart()), [gradYear]);
  return useMemo(() => lunchForDay(sched, personal, grade), [sched, personal, grade]);
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-[var(--text)]">{item.name}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{item.description}</p>
        )}
      </div>
      <span className="tnum shrink-0 text-sm font-bold text-royal dark:text-gold">{item.price}</span>
    </div>
  );
}

function LunchColumn({ label, places, mine }: { label: string; places: string[]; mine: boolean }) {
  return (
    <Card className={cx('p-3.5', mine && 'border-gold bg-gold/10 dark:bg-gold/5')}>
      {/* The gold card is the only "this one is yours" marker now; keep it
          sayable for a screen reader, which can't see the tint. */}
      <h3 className="text-sm font-bold text-[var(--text)]">
        {label}
        {mine && <span className="sr-only"> — yours</span>}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {places.map((p) => (
          <li key={p} className="flex gap-2 text-xs leading-snug text-[var(--muted)]">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
            {p}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function MenuPage() {
  const mounted = useMounted();
  const now = useNow(30_000);
  const admin = useAppStore((s) => s.admin);
  const serverData = useAppStore((s) => s.serverData);
  const [live, setLive] = useState<DiningInfo | null>(null);
  const [section, setSection] = useState<MenuSection>('breakfast');

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchDining().then((info) => alive && setLive(info));
    return () => {
      alive = false;
    };
  }, [mounted]);

  const syncServerData = useAppStore((s) => s.syncServerData);
  const refresh = useCallback(async () => {
    const [info] = await Promise.all([fetchDining(), syncServerData()]);
    setLive(info);
    return info !== null;
  }, [syncServerData]);

  // The menu students see: server-owned, seed+local overlay as offline fallback.
  const items = useMemo(
    () => (mounted ? effectiveDiningItems(serverData, admin) : DINING_MENU),
    [mounted, serverData, admin],
  );
  const diningInfo = effectiveDining(serverData, admin);
  const inSection = items.filter((i) => i.section === section);
  const groups = [...new Set(inSection.map((i) => i.group))];
  const activeMeta = MENU_SECTIONS.find((s) => s.id === section);

  // Hours: admin override wins, then the live page, then the hours the school
  // publishes (bundled). Nothing is invented — the fallback is the same line
  // the Campus Dining page prints — and the admin can change it at any time.
  const hoursText =
    (mounted && diningInfo.hours) ||
    (live?.hours ? `${live.hours.open} – ${live.hours.close}` : '') ||
    DINING_HOURS_DEFAULT;
  const contact = (mounted && diningInfo.contact) || live?.contact || '';

  // Open right now? Weekday + inside the displayed hours.
  const range = hoursText.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  const open = range ? toMinutes(range[1]) : null;
  const close = range ? toMinutes(range[2]) : null;
  const minutesNow = now.hour * 60 + now.minute;
  const knowHours = Boolean(hoursText);
  const openNow =
    open !== null && close !== null && now.weekday <= 5 && minutesNow >= open && minutesNow < close;

  // The guidelines the school prints on that page: live when the proxy reached
  // it, bundled otherwise. They change about as often as the lunch chart does.
  const guidelines = live && live.guidelines.length > 0 ? live.guidelines : DINING_GUIDELINES_DEFAULT;

  const lunch = useMyLunch(now);
  const mine = mounted ? lunch : null;

  // The building chart, live when we have it and bundled when we don't. It
  // changes about once a decade, so an offline device showing it is right.
  const lunchChart =
    live && (live.lunch.first.length > 0 || live.lunch.second.length > 0)
      ? live.lunch
      : DINING_LUNCH_DEFAULT;

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Campus Dining</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Today&apos;s menu from Hanna&apos;s on Campus.
        </p>
      </div>

      {/* Hero: open-now status + hours. */}
      <Card className="overflow-hidden border-royal/30">
        <div className="flex items-center justify-between gap-3 bg-royal/10 px-4 py-3 dark:bg-white/5">
          <div>
            <h2 className="text-lg font-bold text-royal dark:text-gold">Hanna&apos;s on Campus</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <ClockIcon className="h-3.5 w-3.5" />
              {knowHours ? `${hoursText} · school days` : 'Hours unavailable'}
            </p>
          </div>
          {knowHours && (
            <span
              className={cx(
                'shrink-0 text-sm font-bold',
                // -500 tints fail AA on white (2.5:1); -700/-600 clear it in both themes.
                openNow
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400',
              )}
            >
              {openNow ? 'Open now' : 'Closed'}
            </span>
          )}
        </div>
      </Card>

      {/* Section tabs stick to the top of the scroller. top-0, not an offset
          past the header: the header now sits outside the scrolling area. */}
      <div className="sticky top-0 z-20 -mx-4 bg-[var(--bg)] px-4 py-2">
        <Segmented
          value={section}
          onChange={setSection}
          className="bg-[var(--surface)]"
          itemClassName="min-w-0 flex-1"
          options={MENU_SECTIONS.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>

      {activeMeta?.note && (
        <p className="text-center text-xs font-semibold text-gold-deep dark:text-gold">
          Served {activeMeta.note}
        </p>
      )}

      {/* The menu itself, grouped like the board. */}
      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h2 className="section-title">{g}</h2>
          <Card className="divide-y divide-[var(--divider)]">
            {inSection
              .filter((i) => i.group === g)
              .map((i) => (
                <MenuRow key={i.id} item={i} />
              ))}
          </Card>
        </section>
      ))}

      {/* Who eats when: the school's lunch-by-building chart. */}
      <section className="space-y-2">
        <h2 className="section-title">Who eats when</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <LunchColumn label="1st Lunch" places={lunchChart.first} mine={mine === 'first'} />
          <LunchColumn label="2nd Lunch" places={lunchChart.second} mine={mine === 'second'} />
        </div>
      </section>

      {live && live.payment.length > 0 && (
        <Card className="p-4">
          <h2 className="section-title">Payment</h2>
          <PaymentBadges methods={live.payment} className="mt-2.5" />
        </Card>
      )}

      {/* The school's Campus Dining Guidelines: the rules of the line, live from
          the page when we can reach it and bundled when we can't. */}
      {guidelines.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Campus Dining Guidelines</h2>
          <Card className="p-4">
            <ul className="space-y-2">
              {guidelines.map((g) => (
                <li key={g} className="flex gap-2.5 text-sm leading-snug text-[var(--text)]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                  {g}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* No published address, no button — the app never guesses one. */}
      {contact && (
        <LinkButton
          href={mailtoHref(contact, 'Campus Dining question')}
          external
          variant="gold"
          className="w-full"
        >
          <MailIcon className="h-5 w-5" /> {contact}
        </LinkButton>
      )}

      <LinkButton href={DINING_URL} external variant="outline" className="w-full">
        Campus Dining on smhs.org
      </LinkButton>

    </div>
    </PullToRefresh>
  );
}
