'use client';

import { useEffect, useState } from 'react';
import { nowInSchoolTz, DateTime } from './time';

/** Ticks every `intervalMs` (default 1s) and returns "now" in school tz. */
export function useNow(intervalMs = 1000): DateTime {
  const [now, setNow] = useState<DateTime>(() => nowInSchoolTz());
  useEffect(() => {
    const id = setInterval(() => setNow(nowInSchoolTz()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** True once the client has mounted. Guards localStorage/persist rehydration. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
