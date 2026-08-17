/**
 * Hand-granted admin access, fetched from the proxy (see /api/auth/admins).
 * Drives two things: the Admin portal's sign-in picker (granted staff must
 * appear in it before they sign in) and the Admins page (people who already
 * have access are hidden from its search).
 */
'use client';

import { useEffect, useState } from 'react';
import { fetchAdminGrants } from '@/lib/portalAuth';

// Module-level cache, one fetch per app session — same pattern as the staff
// directory. Granting/revoking calls invalidateAdminGrants() so open pickers
// refresh without a reload.
let cachedGrants: Set<string> | null = null;
let inflight: Promise<Set<string> | null> | null = null;
const listeners = new Set<(g: Set<string>) => void>();

async function loadGrants(): Promise<Set<string> | null> {
  if (cachedGrants) return cachedGrants;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const emails = await fetchAdminGrants();
      if (!emails) return null;
      cachedGrants = new Set(emails);
      return cachedGrants;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop the cache and re-fetch; every mounted useAdminGrants() updates. */
export async function invalidateAdminGrants(): Promise<void> {
  cachedGrants = null;
  const next = await loadGrants();
  if (next) for (const l of listeners) l(next);
}

/**
 * The granted-emails set. Starts empty (offline or still loading degrades to
 * directory-derived eligibility only, never to a broken picker).
 */
export function useAdminGrants(): Set<string> {
  const [grants, setGrants] = useState<Set<string>>(cachedGrants ?? new Set());
  useEffect(() => {
    let alive = true;
    void loadGrants().then((g) => {
      if (alive && g) setGrants(g);
    });
    const listener = (g: Set<string>) => setGrants(g);
    listeners.add(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);
  return grants;
}
