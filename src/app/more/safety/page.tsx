'use client';

import { useEffect, useState } from 'react';
import { fetchSafety, type SafetyInfo } from '@/lib/providers/live';
import { telHref } from '@/lib/links';
import { effectiveSchool, useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { BackLink } from '@/components/BackLink';
import { LinkText } from '@/components/LinkText';
import { Card, LinkButton, Spinner } from '@/components/ui';
import { PhoneIcon, ShieldIcon } from '@/components/icons';

const SAFETY_URL = 'https://www.smhs.org/campus-life/safety-and-security';

/**
 * The security line, or an honest gap. No number is invented here: when the
 * live page doesn't publish one and no administrator has entered one, the card
 * says so and points at the main office instead.
 */
function EmergencyCard({ securityPhone }: { securityPhone: string }) {
  return (
    <Card className="p-4">
      <p className="font-bold text-red-600 dark:text-red-400">In an emergency, call 911</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        For anything urgent on campus that isn&apos;t a 911 emergency, call Campus Security.
      </p>
      {securityPhone ? (
        <div className="mt-3">
          <LinkButton
            href={telHref(securityPhone)}
            external
            variant="primary"
            className="w-full py-3.5 text-base"
          >
            <PhoneIcon className="h-5 w-5" /> Campus Security {securityPhone}
          </LinkButton>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-[var(--text)]">
          The Campus Security line isn&apos;t available right now — call the main office.
        </p>
      )}
    </Card>
  );
}

export default function SafetyPage() {
  const mounted = useMounted();
  const school = useAppStore((s) => effectiveSchool(s.serverData, s.admin));
  const [safety, setSafety] = useState<SafetyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // Live scrape first, then the admin's override. An empty string is missing,
  // not a number.
  const securityPhone = (safety?.securityPhone || (mounted && school.securityPhone) || '').trim();

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetchSafety().then((info) => {
      if (!alive) return;
      setSafety(info);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [mounted]);

  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">Safety &amp; Security</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Campus contacts and the policies that keep you safe here.
        </p>
      </div>

      {!mounted || loading ? (
        <Spinner label="Loading safety info…" />
      ) : !safety ? (
        <>
          <EmergencyCard securityPhone={securityPhone} />
          <Card className="p-5 text-center">
            <p className="font-semibold text-[var(--text)]">Live data unavailable right now</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              We couldn&apos;t reach the safety page. Open the real page for the policies.
            </p>
            <div className="mt-4 flex justify-center">
              <LinkButton href={SAFETY_URL} external variant="primary">
                Safety &amp; Security on smhs.org
              </LinkButton>
            </div>
          </Card>
        </>
      ) : (
        <>
          <EmergencyCard securityPhone={securityPhone} />

          <Card className="p-4">
            <h2 className="section-title">Anonymous Tip Line</h2>
            <p className="mt-2 text-sm text-[var(--text)]">
              Report a safety concern without giving your name. No account needed.
            </p>
            {safety.tipLineUrl && (
              <div className="mt-3">
                <LinkButton href={safety.tipLineUrl} external variant="gold" className="w-full">
                  <ShieldIcon className="h-5 w-5" /> Submit an anonymous tip
                </LinkButton>
              </div>
            )}
          </Card>

          {safety.hours && (
            <Card className="p-4">
              <h2 className="section-title">School Hours</h2>
              <p className="mt-2 text-sm text-[var(--text)]">
                <LinkText>{safety.hours}</LinkText>
              </p>
            </Card>
          )}

          {safety.closedCampus && (
            <Card className="p-4">
              <h2 className="section-title">Closed Campus</h2>
              <p className="mt-2 text-sm text-[var(--text)]">
                <LinkText>{safety.closedCampus}</LinkText>
              </p>
            </Card>
          )}

          {safety.visitorPolicy && (
            <Card className="p-4">
              <h2 className="section-title">Visitors</h2>
              <p className="mt-2 text-sm text-[var(--text)]">
                <LinkText>{safety.visitorPolicy}</LinkText>
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
