'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDining, type DiningInfo } from '@/lib/providers/live';
import { DINING_MENU, MENU_SECTIONS, type MenuItem, type MenuSection } from '@/config/dining.seed';
import { effectiveDining, effectiveDiningItems } from '@/lib/store';
import { mailtoHref } from '@/lib/links';
import { useMounted, useNow } from '@/lib/hooks';
import { useAppStore } from '@/lib/store';
import { lunchForBuilding } from '@/config/buildings';
import type { LunchTrack } from '@/lib/types';
import { BackLink } from '@/components/BackLink';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PaymentBadges } from '@/components/PaymentBadges';
import { Card, LinkButton, Pill, Segmented, cx } from '@/components/ui';
import { MailIcon, ClockIcon } from '@/components/icons';

/** "7:00 AM" → minutes since midnight, for the open/closed dot. */
function toMinutes(t: string): number | null {
  const m = t.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

/** The student's own lunch, from their 3rd-period class (science → 1st). */
function useMyLunch(): LunchTrack | null {
  const third = useAppStore((s) => s.schedule[3]);
  if (!third) return null;
  if (third.science) return 'first';
  return lunchForBuilding(third.building);
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
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text)]">{label}</h3>
        {mine && <Pill tone="gold">You</Pill>}
      </div>
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

  // Hours: admin override wins, then the live page. Nothing is invented — with
  // neither, the card says the hours are unknown and shows no open/closed badge.
  const hoursText =
    (mounted && diningInfo.hours) ||
    (live?.hours ? `${live.hours.open} – ${live.hours.close}` : '');
  const contact = (mounted && diningInfo.contact) || live?.contact || '';

  // Open right now? Weekday + inside the displayed hours.
  const range = hoursText.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  const open = range ? toMinutes(range[1]) : null;
  const close = range ? toMinutes(range[2]) : null;
  const minutesNow = now.hour * 60 + now.minute;
  const knowHours = Boolean(hoursText);
  const openNow =
    open !== null && close !== null && now.weekday <= 5 && minutesNow >= open && minutesNow < close;

  const lunch = useMyLunch();
  const mine = mounted ? lunch : null;

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
      {live && (live.lunch.first.length > 0 || live.lunch.second.length > 0) && (
        <section className="space-y-2">
          <h2 className="section-title">Who eats when</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <LunchColumn label="1st Lunch" places={live.lunch.first} mine={mine === 'first'} />
            <LunchColumn label="2nd Lunch" places={live.lunch.second} mine={mine === 'second'} />
          </div>
        </section>
      )}

      {live && live.payment.length > 0 && (
        <Card className="p-4">
          <h2 className="section-title">Payment</h2>
          <PaymentBadges methods={live.payment} className="mt-2.5" />
        </Card>
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

    </div>
    </PullToRefresh>
  );
}
