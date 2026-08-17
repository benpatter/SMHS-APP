'use client';

import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'smchs-theme';

export function getThemePref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function resolveDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveDark(pref));
}

export function setThemePref(pref: ThemePref): void {
  window.localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>('system');
  useEffect(() => {
    setPref(getThemePref());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(getThemePref());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const update = (p: ThemePref) => {
    setThemePref(p);
    setPref(p);
  };
  return [pref, update];
}
