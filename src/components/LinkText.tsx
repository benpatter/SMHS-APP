'use client';

import { Fragment } from 'react';
import { hrefFor, splitOnLinkables } from '@/lib/linkify';

/**
 * Prose with its phone numbers and email addresses made reachable. Drop it in
 * wherever the text comes from the school rather than from us — policies,
 * procedures, contact notes, announcements — and a number in the sentence
 * becomes one tap to call, an address one tap to write, styled like the app's
 * other links.
 *
 * Renders a fragment, so the caller keeps its own <p>/<span> and its styling.
 */
export function LinkText({ children }: { children?: string | null }) {
  const text = children ?? '';
  const parts = splitOnLinkables(text);
  // Nothing to link: hand back the string untouched rather than a pile of spans.
  if (parts.length === 1 && !parts[0].match) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <a
            key={i}
            href={hrefFor(p.match)}
            // The surrounding card is sometimes tappable itself (a link, or an
            // expand toggle); reaching out shouldn't also trigger that.
            onClick={(e) => e.stopPropagation()}
            className={
              p.match.kind === 'phone'
                ? 'tnum whitespace-nowrap font-semibold text-brand underline underline-offset-2 dark:text-gold'
                : 'font-semibold text-brand underline underline-offset-2 [overflow-wrap:anywhere] dark:text-gold'
            }
          >
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
