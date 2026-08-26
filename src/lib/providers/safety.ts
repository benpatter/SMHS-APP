/**
 * The anonymous tip line, cached for the session.
 *
 * The URL is never written down here: it comes from the school's own Safety &
 * Security page (scraped by the proxy into /api/safety), so if the school moves
 * the form the app follows. Until it loads — and whenever the proxy can't be
 * reached — callers fall back to the Safety page, which is always reachable.
 */
'use client';

import { useEffect, useState } from 'react';
import { fetchSafety } from '@/lib/providers/live';

// Module-level cache, one fetch per app session — same pattern as the staff
// directory.
let cachedUrl: string | null = null;
let inflight: Promise<string | null> | null = null;

async function loadTipLineUrl(): Promise<string | null> {
  if (cachedUrl) return cachedUrl;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const info = await fetchSafety();
      const url = info?.tipLineUrl?.trim();
      if (url) cachedUrl = url;
      return cachedUrl;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The live tip-form URL, or null while loading / when it isn't published. */
export function useTipLineUrl(): string | null {
  const [url, setUrl] = useState<string | null>(cachedUrl);
  useEffect(() => {
    let alive = true;
    if (!cachedUrl) {
      void loadTipLineUrl().then((u) => {
        if (alive) setUrl(u);
      });
    }
    return () => {
      alive = false;
    };
  }, []);
  return url;
}
