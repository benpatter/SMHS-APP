'use client';

import { LinkButton } from '@/components/ui';

/**
 * Replaces Next's built-in 404, which hardcodes `height: 100vh` on its own
 * wrapper. Inside the app shell that stacks on top of the header and the
 * bottom-nav padding, so the page scrolled ~147px with nothing to show.
 */
export default function NotFound() {
  return (
    <div className="space-y-3 py-6 text-center">
      <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Page not found</h1>
      <p className="text-sm text-[var(--muted)]">
        That page isn&apos;t part of the app.
      </p>
      <LinkButton href="/">Back to Home</LinkButton>
    </div>
  );
}
