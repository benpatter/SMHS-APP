/**
 * Web Push wiring for schedule-change alerts. The server (see /server) holds
 * the VAPID keys and the subscription list; this module asks the user for
 * notification permission, subscribes this device, and registers the
 * subscription with the server. On iPhone/iPad, push only exists for the
 * installed app (Add to Home Screen, iOS 16.4+), so pushSupported() is false
 * in a plain Safari tab there and the UI shows the install hint instead.
 */
'use client';

import { API_BASE } from '@/config/api';
import { track } from './metrics';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | null {
  return pushSupported() ? Notification.permission : null;
}

/**
 * Opened over plain http (e.g. a LAN IP during testing): the browser hides the
 * whole push machinery. Check this BEFORE the install hint; installing an
 * insecure page to the Home Screen would not get push either.
 */
export function insecureContext(): boolean {
  return typeof window !== 'undefined' && !window.isSecureContext;
}

/** iPhone/iPad browser tab (not installed): push needs Add to Home Screen first. */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === 'undefined' || pushSupported()) return false;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * `navigator.serviceWorker.ready` never rejects — if registration failed it
 * simply hangs forever, leaving callers stuck (the Settings toggle sat on "…"
 * and stayed disabled). Always race it against a timeout.
 */
function swReady(timeoutMs = 5000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/** The browser's active push subscription on this device, if any. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await swReady();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/** base64url VAPID key to the raw bytes subscribe() wants. */
function keyBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64u + '='.repeat((4 - (b64u.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Do the subscription's server key and the server's current key match? */
function sameKey(existing: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!existing) return false;
  const a = new Uint8Array(existing);
  if (a.length !== wanted.length) return false;
  return a.every((byte, i) => byte === wanted[i]);
}

export type EnablePushResult = 'enabled' | 'denied' | 'error';

/**
 * Ask for permission (must be called from a user tap), subscribe this device,
 * and register the subscription with the server.
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (!pushSupported()) return 'error';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const reg = await swReady();
    if (!reg) return 'error';
    const keyRes = await fetch(`${API_BASE}/api/push/key`);
    if (!keyRes.ok) return 'error';
    const { key } = (await keyRes.json()) as { key: string };
    // An existing subscription is only reusable if it was made with the key the
    // server signs with TODAY. If the server's keypair ever changes, a stale
    // subscription is silently undeliverable forever (the push service answers
    // 403, which is not a prune condition) and the user sees a working toggle
    // that receives nothing. Compare, and re-subscribe on mismatch.
    const wanted = keyBytes(key);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, wanted)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: wanted,
    });
    const res = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    // A spike in opt-outs signals notification fatigue — both directions are
    // counted (anonymously) for the admin Communication metrics.
    if (res.ok) track('notif_on');
    return res.ok ? 'enabled' : 'error';
  } catch {
    return 'error';
  }
}

/** Unsubscribe this device and drop it from the server's list. */
export async function disablePush(): Promise<void> {
  const sub = await getPushSubscription();
  if (!sub) return;
  track('notif_off');
  try {
    await fetch(`${API_BASE}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The auth secret proves this device owns the subscription, so knowing
      // an endpoint isn't enough to silence someone else's phone.
      body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
    });
  } catch {
    // server unreachable: the sub is pruned on its next dead delivery anyway
  }
  try {
    await sub.unsubscribe();
  } catch {
    // already gone
  }
}
