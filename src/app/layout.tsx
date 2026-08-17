import type { Metadata, Viewport } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { ServiceWorker } from '@/components/ServiceWorker';
import { ThemeScript } from '@/components/ThemeScript';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Cinzel({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SMCHS | Santa Margarita Catholic High School',
  description:
    'The official Santa Margarita Catholic High School app: live period countdown, bell schedules, Campus Life announcements, and the school calendar. Works offline.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SMHS' },
  // iOS ignores SVG icons: the Home Screen icon must be the PNG.
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#1A4784',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ServiceWorker />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
