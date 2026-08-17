import { SCHOOL } from '@/config/school';
import { cx } from './ui';

/** The institutional SM mark + wordmark. Academic identifier (never the Eagle). */
export function BrandMark({
  size = 'md',
  showWordmark = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  className?: string;
}) {
  const dim = size === 'xl' ? 88 : size === 'lg' ? 48 : size === 'sm' ? 28 : 36;
  // Two-line institutional wordmark: "Santa Margarita" over "Catholic High School".
  // Driven by explicit config; falls back to a name-split if it's ever absent.
  const [line1, line2] = SCHOOL.wordmark ?? [
    SCHOOL.name.split(' ').slice(0, 2).join(' '),
    SCHOOL.name.split(' ').slice(2).join(' '),
  ];
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/sm-logo.svg"
        alt={`${SCHOOL.shortName} logo`}
        width={dim}
        height={dim}
        className="shrink-0"
      />
      {showWordmark && (
        <div className="leading-tight">
          <div className="wordmark text-royal dark:text-[var(--text)]" style={{ fontSize: dim * 0.5 }}>
            {line1}
          </div>
          <div
            className="wordmark text-[var(--muted)]"
            style={{ fontSize: dim * 0.34, letterSpacing: '0.04em' }}
          >
            {line2}
          </div>
        </div>
      )}
    </div>
  );
}
