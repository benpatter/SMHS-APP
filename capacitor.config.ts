import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Wraps the SAME static export (`out/`) into native iOS and Android apps.
 * Run `npm run cap:sync` after adding platforms (`npx cap add ios|android`).
 * The web build is fully local-first, so the native shells need no server.
 */
const config: CapacitorConfig = {
  appId: 'org.smhs.app',
  appName: 'SMCHS',
  webDir: 'out',
  backgroundColor: '#1A4784',
  ios: {
    // Safe areas are paid in CSS (env(safe-area-inset-*)), so the web view must
    // not also inset the content or every edge gets spaced twice.
    contentInset: 'never',
    // The outer UIScrollView is disabled entirely — <main> is the only
    // scroller. Without this WKWebView still rubber-bands the whole page and
    // exposes the royal backgroundColor below as a stray blue bar.
    scrollEnabled: false,
  },
  android: {
    backgroundColor: '#1A4784',
  },
};

export default config;
