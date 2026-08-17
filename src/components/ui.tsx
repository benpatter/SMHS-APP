'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';

const FIELD_INPUT =
  'mt-1 w-full rounded-card border border-[var(--divider)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)] outline-none focus:border-royal';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & ComponentProps<'div'>) {
  return (
    <div className={cx('app-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('section-title', className)}>{children}</h2>;
}

type ButtonVariant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-royal text-white hover:bg-royal-700 active:bg-royal-800',
  gold: 'bg-gold text-anthracite hover:bg-gold-deep hover:text-white',
  outline:
    'bg-transparent text-royal dark:text-[var(--text)] border border-[var(--divider)] hover:border-royal',
  ghost: 'bg-transparent text-[var(--text)] hover:bg-black/5 dark:hover:bg-white/5',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
};

type ButtonSize = 'sm' | 'md';

// `.tap` is on the base class, so both sizes keep the 48×48 hit area — `sm`
// only shrinks the ink, not the target.
const SIZES: Record<ButtonSize, string> = {
  md: 'px-4 py-2.5 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: { variant?: ButtonVariant; size?: ButtonSize } & ComponentProps<'button'>) {
  return (
    <button
      className={cx(
        'tap inline-flex items-center justify-center gap-2 rounded-card font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  className,
  children,
  external,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
  external?: boolean;
} & Omit<ComponentProps<'a'>, 'href'>) {
  const cls = cx(
    'tap inline-flex items-center justify-center gap-2 rounded-card px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold',
    VARIANTS[variant],
    className,
  );
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

export function Pill({
  children,
  tone = 'gold',
  className,
}: {
  children: ReactNode;
  tone?: 'gold' | 'royal' | 'muted' | 'on-royal' | 'danger';
  className?: string;
}) {
  const tones = {
    // gold-deep (#8f8049) on the gold/20 tint only reaches ~3.9:1 — under AA for
    // this 12px uppercase text. gold-ink is the same hue taken darker to clear it.
    gold: 'bg-gold/20 text-gold-ink dark:text-gold border border-gold/40',
    // For pills sitting ON the royal hero banner, where the surface is dark in
    // BOTH themes — the light-surface tones invert to unreadable there.
    'on-royal': 'bg-white/15 text-white border border-white/35',
    royal: 'bg-royal/10 text-brand border border-royal/30',
    muted: 'bg-black/5 text-[var(--muted)] border border-[var(--divider)] dark:bg-white/5',
    danger: 'bg-danger/10 text-danger border border-danger/40',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-card px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Segmented control — a row of mutually exclusive filters. Every item is a real
 * button carrying `aria-pressed`, including the active one, so the whole row
 * stays keyboard reachable.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  itemClassName,
}: {
  /** An option with `href` renders as a link instead of a button (e.g. a tab that leaves the app). */
  options: ReadonlyArray<{
    value: T;
    label: ReactNode;
    href?: string;
    external?: boolean;
    /** Runs on the link. preventDefault() to take the navigation over. */
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  }>;
  value: T;
  onChange?: (value: T) => void;
  label?: string;
  className?: string;
  itemClassName?: string;
}) {
  const cls = (active: boolean) =>
    cx(
      'tap flex items-center justify-center rounded-card px-3 py-1.5 text-xs font-semibold transition-colors',
      active
        ? 'bg-royal text-white dark:bg-gold dark:text-anthracite'
        : 'text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5',
      itemClassName,
    );
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={cx('flex gap-1 rounded-card border border-[var(--divider)] p-1', className)}
    >
      {options.map((o) => {
        const active = value === o.value;
        if (o.href && !active) {
          return (
            <a
              key={o.value}
              href={o.href}
              onClick={o.onClick}
              className={cls(false)}
              {...(o.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {o.label}
            </a>
          );
        }
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(o.value)}
            className={cls(active)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-6 text-center">
      <p className="font-semibold text-[var(--text)]">{title}</p>
      {children && <p className="mt-1 text-sm text-[var(--muted)]">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--divider)] border-t-royal" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function Divider() {
  return <hr className="border-0 border-t border-[var(--divider)]" />;
}

/** Labeled field wrapper for forms. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(FIELD_INPUT, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cx(FIELD_INPUT, 'min-h-[80px] resize-y', className)} {...rest} />;
}

// Chevron-down so it's clear the field is a dropdown (native arrow is removed by
// appearance-none). Rendered as a centered background image on the right edge.
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select
      className={cx(FIELD_INPUT, 'appearance-none bg-no-repeat pr-10', className)}
      style={{ backgroundImage: SELECT_CHEVRON, backgroundPosition: 'right 0.75rem center', backgroundSize: '1.1rem' }}
      {...rest}
    >
      {children}
    </select>
  );
}
