'use client';

import { useState } from 'react';
import { effectiveSchool, useAppStore } from '@/lib/store';
import { AERIES, ATTENDANCE } from '@/config/school';
import { AdminGate } from '@/components/AdminGate';
import { Button, Card, Field, SectionTitle, TextArea, TextInput } from '@/components/ui';

/**
 * The details the school actually changes: the attendance line and what it
 * tells parents, the security line, and the external services the app links to.
 * The phone is typed once, the way it should read on screen; the dialable
 * number is its digits, so there's no second field to keep in step.
 */
function dialable(display: string): string | undefined {
  const digits = display.replace(/\D/g, '');
  if (digits.length < 10) return undefined;
  return `+1${digits.slice(-10)}`;
}

/** Real defaults the fields show as placeholders (blank = keep the default). */
const PRAYER_FORM_PLACEHOLDER = 'https://forms.office.com/…';
const TICKETS_PLACEHOLDER = 'https://gofan.co/app/school/CA19032';
const LIVESTREAM_PLACEHOLDER = 'https://www.smhs.org/athletics/livestream';

function SchoolLinksCard() {
  const school = useAppStore((s) => effectiveSchool(s.serverData, s.admin));
  const setSchoolOverride = useAppStore((s) => s.setSchoolOverride);

  const [aeries, setAeries] = useState(school.aeriesWebPortal ?? '');
  const [phone, setPhone] = useState(school.attendancePhoneDisplay ?? '');
  const [procedure, setProcedure] = useState(school.attendanceProcedure ?? '');
  const [hours, setHours] = useState(school.attendanceHours ?? '');
  const [security, setSecurity] = useState(school.securityPhone ?? '');
  const [prayerForm, setPrayerForm] = useState(school.prayerRequestFormUrl ?? '');
  const [tickets, setTickets] = useState(school.athleticsTicketsUrl ?? '');
  const [livestream, setLivestream] = useState(school.athleticsLivestreamUrl ?? '');
  const [saved, setSaved] = useState(false);

  const change = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setSaved(false);
  };

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle>Attendance</SectionTitle>
      <Field label="Attendance phone" hint="What parents tap to report an absence.">
        <TextInput
          type="tel"
          value={phone}
          onChange={change(setPhone)}
          placeholder={ATTENDANCE.phoneDisplay}
        />
      </Field>
      <Field label="How to report an absence" hint="Blank uses the built-in default.">
        <TextArea rows={3} value={procedure} onChange={change(setProcedure)} placeholder={ATTENDANCE.procedure} />
      </Field>
      <Field label="Attendance office hours" hint="Blank uses the built-in default.">
        <TextInput value={hours} onChange={change(setHours)} placeholder={ATTENDANCE.hours} />
      </Field>

      <SectionTitle>Safety</SectionTitle>
      <Field
        label="Campus Security phone"
        hint="Shown when the live safety page can't be reached. Blank means the app says the line is unavailable rather than guessing."
      >
        <TextInput type="tel" value={security} onChange={change(setSecurity)} placeholder="(949) 555-0100" />
      </Field>

      <SectionTitle>Links</SectionTitle>
      <Field label="Aeries web portal URL" hint="Opens when the Aeries app isn't installed.">
        <TextInput type="url" value={aeries} onChange={change(setAeries)} placeholder={AERIES.webPortal} />
      </Field>
      <Field label="Prayer request form URL" hint="Blank uses the built-in default.">
        <TextInput
          type="url"
          value={prayerForm}
          onChange={change(setPrayerForm)}
          placeholder={PRAYER_FORM_PLACEHOLDER}
        />
      </Field>
      <Field label="Athletics tickets URL" hint="Blank uses the built-in default.">
        <TextInput type="url" value={tickets} onChange={change(setTickets)} placeholder={TICKETS_PLACEHOLDER} />
      </Field>
      <Field label="Athletics livestream URL" hint="Blank uses the built-in default.">
        <TextInput
          type="url"
          value={livestream}
          onChange={change(setLivestream)}
          placeholder={LIVESTREAM_PLACEHOLDER}
        />
      </Field>

      <Button
        className="w-full"
        onClick={() => {
          const display = phone.trim();
          setSchoolOverride({
            aeriesWebPortal: aeries.trim() || undefined,
            attendancePhone: display ? dialable(display) : undefined,
            attendancePhoneDisplay: display || undefined,
            attendanceProcedure: procedure.trim() || undefined,
            attendanceHours: hours.trim() || undefined,
            securityPhone: security.trim() || undefined,
            prayerRequestFormUrl: prayerForm.trim() || undefined,
            athleticsTicketsUrl: tickets.trim() || undefined,
            athleticsLivestreamUrl: livestream.trim() || undefined,
          });
          setSaved(true);
        }}
      >
        {saved ? 'Saved ✓' : 'Save'}
      </Button>
    </Card>
  );
}

/**
 * The staff passcode that unlocks these pages. It lives on this device only
 * (there is no passcode server), so changing it here doesn't change anyone
 * else's — hence the current-passcode check before a new one is accepted.
 */
function PasscodeCard() {
  const pin = useAppStore((s) => s.admin.pin);
  const setAdminPin = useAppStore((s) => s.setAdminPin);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (pin !== null && current.trim() !== pin) {
      setError('That current passcode is wrong.');
      setSaved(false);
      return;
    }
    if (!next.trim()) {
      setError('Enter a new passcode.');
      setSaved(false);
      return;
    }
    setAdminPin(next.trim());
    setCurrent('');
    setNext('');
    setError('');
    setSaved(true);
  };

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle>Staff passcode</SectionTitle>
      {pin !== null && (
        <Field label="Current passcode">
          <TextInput
            type="password"
            inputMode="numeric"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setError('');
              setSaved(false);
            }}
            placeholder="••••"
          />
        </Field>
      )}
      <Field label="New passcode" hint="This passcode is set per device — it only unlocks the admin pages here.">
        <TextInput
          type="password"
          inputMode="numeric"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setError('');
            setSaved(false);
          }}
          placeholder="••••"
        />
      </Field>
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      <Button className="w-full" onClick={save}>
        {saved ? 'Saved ✓' : pin === null ? 'Set passcode' : 'Change passcode'}
      </Button>
    </Card>
  );
}

export default function AdminSchoolPage() {
  return (
    <AdminGate title="School Info & Links">
      <SchoolLinksCard />
      <PasscodeCard />
    </AdminGate>
  );
}
