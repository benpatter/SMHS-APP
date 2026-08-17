'use client';

import { useAppStore } from '@/lib/store';
import { useMounted, useNow } from '@/lib/hooks';
import { formatClock, formatDayLabel } from '@/lib/time';
import { Button } from '@/components/ui';

/**
 * Shown on every page when "time travel" is active, so it's never a surprise that
 * the app is rendering a different moment. Ticks live from the chosen instant.
 */
export function DemoBanner() {
  const mounted = useMounted();
  const offset = useAppStore((s) => s.clockOffsetMs);
  const setClockOffsetMs = useAppStore((s) => s.setClockOffsetMs);
  const now = useNow(1000);

  if (!mounted || !offset) return null;

  return (
    <div className="border-b border-gold/50 bg-gold/15 px-4 py-2 text-sm font-semibold text-gold-deep dark:text-gold">
      <div className="mx-auto flex max-w-screen-sm items-center gap-2">
        <span aria-hidden="true">🕐</span>
        <span className="min-w-0 flex-1 truncate">
          Demo: viewing {formatDayLabel(now)} · {formatClock(now)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setClockOffsetMs(0)}
          className="shrink-0"
        >
          Exit demo
        </Button>
      </div>
    </div>
  );
}
