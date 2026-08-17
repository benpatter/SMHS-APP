/**
 * Campus map pins are ADMIN-CREATED ONLY: they live in the server-owned data
 * (/api/data `pois`) and admins manage them in /admin/map. There is no seed
 * list — a device that has synced once keeps the last copy in its on-device
 * cache (lib/providers/data.ts), which is the offline fallback.
 */
export {};
