'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

/**
 * Payment-method badges with the real brand marks, drawn as inline SVG: the
 * app makes zero external requests (see /more/privacy), so no logo CDNs.
 * Badges stay white in both themes on purpose: that's how the brands are
 * meant to be shown, and it's how checkout rows look everywhere.
 */

function Badge({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-white shadow-sm"
    >
      {children}
    </span>
  );
}

/** The Apple mark (simple-icons path) + "Pay". */
function ApplePay() {
  return (
    <Badge label="Apple Pay">
      <span className="flex items-center gap-[3px] text-black">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
        </svg>
        <span className="text-[11px] font-semibold leading-none tracking-tight">Pay</span>
      </span>
    </Badge>
  );
}

/** The four-color Google "G" + "Pay". */
function GooglePay() {
  return (
    <Badge label="Google Pay">
      <span className="flex items-center gap-[3px]">
        <svg viewBox="0 0 24 24" className="h-[11px] w-[11px]" aria-hidden>
          <path
            fill="#4285F4"
            d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.86z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1z"
          />
          <path
            fill="#EA4335"
            d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z"
          />
        </svg>
        <span className="text-[11px] font-semibold leading-none tracking-tight text-[#5F6368]">Pay</span>
      </span>
    </Badge>
  );
}

/** Visa's italic navy wordmark. */
function Visa() {
  return (
    <Badge label="Visa">
      <span className="text-[12px] font-extrabold italic leading-none tracking-tighter text-[#1A1F71]">
        VISA
      </span>
    </Badge>
  );
}

/** Mastercard's interlocking circles: pure geometry, instantly recognizable. */
function Mastercard() {
  return (
    <Badge label="Mastercard">
      <svg viewBox="0 0 36 22" className="h-4" aria-hidden>
        <circle cx="13" cy="11" r="10" fill="#EB001B" />
        <circle cx="23" cy="11" r="10" fill="#F79E1B" />
        <path
          d="M18 3.2a10 10 0 0 1 0 15.6 10 10 0 0 1 0-15.6z"
          fill="#FF5F00"
        />
      </svg>
    </Badge>
  );
}

/** Amex's blue box wordmark. */
function Amex() {
  return (
    <Badge label="American Express">
      <span className="flex h-full w-full items-center justify-center bg-[#006FCF]">
        <span className="text-[8px] font-extrabold leading-none tracking-tight text-white">
          AMEX
        </span>
      </span>
    </Badge>
  );
}

/** Discover's wordmark with the orange "O". */
function Discover() {
  return (
    <Badge label="Discover">
      <span className="flex items-center text-[8px] font-extrabold leading-none tracking-tight text-[#231F20]">
        DISC
        <svg viewBox="0 0 10 10" className="mx-[0.5px] h-[7px] w-[7px]" aria-hidden>
          <circle cx="5" cy="5" r="5" fill="#F76E20" />
        </svg>
        VER
      </span>
    </Badge>
  );
}

/** Cash: a simple green bill. */
function Cash() {
  return (
    <Badge label="Cash">
      <svg viewBox="0 0 30 18" className="h-[13px]" aria-hidden>
        <rect x="1" y="1" width="28" height="16" rx="2" fill="#1B7A43" />
        <rect x="3.5" y="3.5" width="23" height="11" rx="1" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1" />
        <circle cx="15" cy="9" r="4" fill="none" stroke="#fff" strokeWidth="1.2" />
        <text x="15" y="11.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff">
          $
        </text>
      </svg>
    </Badge>
  );
}

const BADGES: { match: RegExp; el: () => JSX.Element }[] = [
  { match: /apple\s*pay/i, el: ApplePay },
  { match: /google\s*pay/i, el: GooglePay },
  { match: /^visa$/i, el: Visa },
  { match: /mastercard|master\s*card/i, el: Mastercard },
  { match: /american\s*express|amex/i, el: Amex },
  { match: /discover/i, el: Discover },
  { match: /cash/i, el: Cash },
];

/** A row of brand badges for the scraped payment-method names. */
export function PaymentBadges({ methods, className }: { methods: string[]; className?: string }) {
  return (
    // One centered line, never wrapping: the badges are sized so all six
    // known methods fit a phone-width card.
    <div className={cx('flex flex-nowrap items-center justify-center gap-1.5', className)}>
      {methods.map((m) => {
        const known = BADGES.find((b) => b.match.test(m.trim()));
        if (known) {
          const El = known.el;
          return <El key={m} />;
        }
        // Unknown method (future scrape values): honest text fallback.
        return (
          <span
            key={m}
            className="inline-flex h-7 shrink-0 items-center rounded-md border border-[var(--divider)] px-2 text-[10px] font-semibold text-[var(--muted)]"
          >
            {m}
          </span>
        );
      })}
    </div>
  );
}
