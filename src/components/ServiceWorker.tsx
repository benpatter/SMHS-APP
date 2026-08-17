'use client';

import { useEffect } from 'react';

/** Registers the offline-first service worker (no-op in non-secure/dev contexts). */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
