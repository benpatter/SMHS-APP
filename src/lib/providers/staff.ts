/**
 * The school's Faculty & Staff directory, served by the proxy's /api/staff
 * (scraped from smhs.org → About → Faculty & Staff). Drives the teacher pickers
 * in the Admin/Teacher portal identity steps.
 */
'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/config/api';

export interface StaffMember {
  name: string;
  title: string;
  email: string;
  /** Directory department names this person belongs to (can be several). */
  departments: string[];
}

export interface StaffDirectory {
  departments: string[];
  staff: StaffMember[];
}

// Module-level cache: the roster changes rarely; one fetch per app session.
let cachedDir: StaffDirectory | null = null;
let inflight: Promise<StaffDirectory | null> | null = null;

export async function fetchStaffDirectory(): Promise<StaffDirectory | null> {
  if (cachedDir) return cachedDir;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/staff`, { cache: 'no-store' });
      if (!res.ok) return null;
      const j = await res.json();
      if (!Array.isArray(j.staff) || !Array.isArray(j.departments)) return null;
      cachedDir = { departments: j.departments, staff: j.staff };
      return cachedDir;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The directory, or null while loading / when the proxy is unreachable. */
export function useStaffDirectory(): { directory: StaffDirectory | null; loading: boolean } {
  const [directory, setDirectory] = useState<StaffDirectory | null>(cachedDir);
  const [loading, setLoading] = useState(cachedDir === null);
  useEffect(() => {
    let alive = true;
    if (!cachedDir) {
      fetchStaffDirectory().then((dir) => {
        if (!alive) return;
        setDirectory(dir);
        setLoading(false);
      });
    }
    return () => {
      alive = false;
    };
  }, []);
  return { directory, loading };
}

/**
 * Staff whose name matches a typed query: every word of the name is checked as
 * a prefix (typing "t" lists Ts; "smi" finds Smith), optionally narrowed to one
 * department first.
 */
export function matchStaff(
  staff: StaffMember[],
  query: string,
  department: string | null,
): StaffMember[] {
  const inDept = department ? staff.filter((s) => s.departments.includes(department)) : staff;
  const q = query.trim().toLowerCase();
  if (!q) return inDept;
  // Match per typed word, not on the whole query at once. The sign-in prompt
  // says "start typing your name", and people type their FULL name — matching
  // the entire query against single name words meant "Jorge Ledezma" matched
  // nobody (no one word starts with "jorge ledezma"), so the picker showed
  // "no staff match" and Continue stayed disabled for anyone who did that.
  // Every typed word must prefix some word of the name, in any order.
  const terms = q.split(/[\s.'-]+/).filter(Boolean);
  return inDept.filter((s) => {
    const words = s.name.toLowerCase().split(/[\s.'-]+/);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  });
}
