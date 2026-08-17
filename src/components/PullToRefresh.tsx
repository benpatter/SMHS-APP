'use client';

import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { fetchLiveSchedule } from '@/lib/providers/live';
import { useAppStore } from '@/lib/store';
import { cx } from './ui';

/** Real resyncs are capped to one per minute; pulls inside the window answer
    "Up to date" locally so the school's proxy can't be spammed. */
const COOLDOWN_MS = 60_000;
const THRESHOLD = 64;
const SETTLE_MS = 1200;
let lastSyncAt = 0;

type Phase = 'idle' | 'pulling' | 'syncing' | 'done';

/**
 * Pull-down-to-resync wrapper. Dragging down from the top reveals an indicator;
 * releasing past the threshold refetches. Pages that own their own live data
 * pass `onRefresh` (their fetch plus the shared server data); without it the
 * pull refetches the live bell schedule, which is what Home shows.
 * Returning false from `onRefresh` reports "No connection".
 */
export function PullToRefresh({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh?: () => Promise<boolean | void>;
}) {
  const setLiveSchedule = useAppStore((s) => s.setLiveSchedule);
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  // Gesture bookkeeping lives in refs, not state: touch handlers can fire
  // several times between renders, and stale closure state would drop the
  // release (leaving the indicator stuck open).
  const dragging = useRef(false);
  const pullRef = useRef(0);
  const busy = useRef(false);

  const atTop = () => {
    const scroller = wrapRef.current?.closest('main');
    return !scroller || scroller.scrollTop <= 0;
  };

  const settle = (msg: string) => {
    setMessage(msg);
    setPhase('done');
    setPull(32);
    setTimeout(() => {
      busy.current = false;
      setPhase('idle');
      setPull(0);
    }, SETTLE_MS);
  };

  const sync = async () => {
    if (Date.now() - lastSyncAt < COOLDOWN_MS) {
      settle('Up to date');
      return;
    }
    lastSyncAt = Date.now();
    setPhase('syncing');
    setPull(32);
    if (onRefresh) {
      const ok = await onRefresh();
      settle(ok === false ? 'No connection' : 'Up to date');
      return;
    }
    const days = await fetchLiveSchedule();
    if (days) {
      setLiveSchedule(days);
      settle('Up to date');
    } else {
      settle('No connection');
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (busy.current || !atTop()) return;
    dragging.current = true;
    pullRef.current = 0;
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!dragging.current || startY.current == null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0 || !atTop()) {
      pullRef.current = 0;
      setPull(0);
      setPhase('idle');
      return;
    }
    // Rubber-band feel: the indicator opens at half the finger's travel.
    pullRef.current = Math.min(delta / 2, 96);
    setPull(pullRef.current);
    setPhase('pulling');
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;
    if (pullRef.current >= THRESHOLD / 2) {
      busy.current = true;
      void sync();
    } else {
      setPhase('idle');
      setPull(0);
    }
    pullRef.current = 0;
  };

  const label =
    phase === 'syncing'
      ? 'Checking…'
      : phase === 'done'
        ? message
        : pull >= THRESHOLD / 2
          ? 'Release to resync'
          : 'Pull to resync';

  return (
    <div
      ref={wrapRef}
      className="flex min-h-full flex-col"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{ height: pull }}
        className={cx(
          'flex shrink-0 items-center justify-center gap-2 overflow-hidden',
          phase !== 'pulling' && 'transition-[height] duration-300',
        )}
        aria-live="polite"
      >
        {phase === 'syncing' && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--divider)] border-t-royal" />
        )}
        {pull > 8 && (
          <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
        )}
      </div>
      {children}
    </div>
  );
}
