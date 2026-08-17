'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useMounted } from '@/lib/hooks';
import { GradIcon, PlusIcon, TrashIcon, ChevronRight } from '@/components/icons';
import { Button, Card, Field, SectionTitle, TextInput, cx } from '@/components/ui';
import { gradYearOptions, currentSchoolYearStart } from '@/lib/schoolYear';
import { gradeFromGradYear } from '@/lib/types';

const GRADE_NAME: Record<number, string> = { 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' };

/** Class-year picker, the same grid students see when they onboard. */
function GradYearPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (y: number | null) => void;
}) {
  const yearStart = currentSchoolYearStart();
  return (
    <div className="grid grid-cols-2 gap-2">
      {gradYearOptions().map((y) => {
        const g = gradeFromGradYear(y, yearStart);
        const selected = value === y;
        return (
          <button
            key={y}
            onClick={() => onChange(selected ? null : y)}
            aria-pressed={selected}
            className={cx(
              'tap rounded-card border px-3 py-3 text-left transition-colors',
              selected ? 'border-gold bg-gold/15' : 'border-[var(--divider)] hover:border-royal',
            )}
          >
            <div className="text-lg font-bold text-[var(--text)]">Class of {y}</div>
            <div className="text-xs text-[var(--muted)]">{g ? GRADE_NAME[g] : 'Alum'}</div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The parent hub: manage children and open each child's page. This is where a
 * parent lands after picking "Parent" on the welcome screen, and where the
 * child switcher on Home returns for add/remove. Children (and their
 * schedules) persist on-device across sign-outs — only deleting removes them.
 */
export default function ParentHubPage() {
  const router = useRouter();
  const mounted = useMounted();
  const hydrated = useAppStore((s) => s.hydrated);
  const userRole = useAppStore((s) => s.userRole);
  const children = useAppStore((s) => s.parentChildren);
  const addParentChild = useAppStore((s) => s.addParentChild);
  const updateParentChild = useAppStore((s) => s.updateParentChild);
  const deleteParentChild = useAppStore((s) => s.deleteParentChild);
  const selectParentChild = useAppStore((s) => s.selectParentChild);
  const signOutParent = useAppStore((s) => s.signOutParent);

  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState('');
  const [childYear, setChildYear] = useState<number | null>(null);
  // Which child's class year is being changed, if any.
  const [editingYear, setEditingYear] = useState<string | null>(null);

  // Not a parent device (deep link / signed out): back to the app root.
  useEffect(() => {
    if (mounted && hydrated && userRole !== 'parent') router.replace('/');
  }, [mounted, hydrated, userRole, router]);

  const openChild = (id: string) => {
    selectParentChild(id);
    router.push('/');
  };

  const addChild = () => {
    addParentChild(childName, childYear);
    setChildName('');
    setChildYear(null);
    setAdding(false);
  };

  const signOut = () => {
    signOutParent();
    router.replace('/');
  };

  const listView = (
    <>
      <section className="space-y-2">
        <SectionTitle>Children</SectionTitle>
        <div className="space-y-2.5">
          <Button className="w-full" onClick={() => setAdding(true)}>
            <span className="inline-flex items-center gap-2">
              <PlusIcon className="h-5 w-5" />
              Add Child
            </span>
          </Button>

          {mounted && hydrated && children.length > 0 && (
            <Card className="divide-y divide-[var(--divider)] overflow-hidden">
              {children.map((c, i) => {
                const label = c.name || `Child ${i + 1}`;
                const grade = gradeFromGradYear(c.gradYear ?? null, currentSchoolYearStart());
                return (
                  <div key={c.id}>
                    <div className="flex items-center">
                      <button
                        className="tap flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                        onClick={() => openChild(c.id)}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-card bg-royal/10 text-royal dark:bg-white/5 dark:text-gold">
                          <GradIcon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-[var(--text)]">{label}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">
                            {grade ? `${GRADE_NAME[grade]} · Class of ${c.gradYear}` : 'No class year set'}
                          </span>
                        </span>
                        <ChevronRight className="h-5 w-5 text-[var(--muted)]" />
                      </button>
                      <button
                        onClick={() => deleteParentChild(c.id)}
                        aria-label={`Delete ${label}`}
                        className="tap flex items-center justify-center px-4 py-3 text-[var(--muted)] hover:text-danger"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                    {/* Their year decides which periods are theirs, so it stays
                        changeable here — children move up a grade every year. */}
                    <div className="px-4 pb-3">
                      <button
                        onClick={() => setEditingYear(editingYear === c.id ? null : c.id)}
                        className="tap text-xs font-bold text-royal dark:text-gold"
                      >
                        {editingYear === c.id
                          ? 'Done'
                          : grade
                            ? 'Change class year'
                            : 'Set class year →'}
                      </button>
                      {editingYear === c.id && (
                        <div className="mt-2">
                          <GradYearPicker
                            value={c.gradYear ?? null}
                            onChange={(y) => updateParentChild(c.id, { gradYear: y })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </section>

      {/* Same full-width sign out students get at the bottom of More. */}
      <Button variant="outline" className="w-full text-[var(--muted)]" onClick={signOut}>
        Sign out
      </Button>
    </>
  );

  const addView = (
    <>
      <Card className="space-y-4 p-5">
        <Field label="Child’s name" hint="Optional. Leave it blank if you want.">
          <TextInput
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="First name (optional)"
            autoComplete="off"
          />
        </Field>
        <Field
          label="When do they graduate?"
          hint="Sets their grade, so you see the periods that are actually theirs."
        >
          <GradYearPicker value={childYear} onChange={setChildYear} />
        </Field>
      </Card>

      <div className="space-y-2">
        <Button className="w-full" onClick={addChild}>
          Add child
        </Button>
        <Button
          variant="ghost"
          className="w-full text-[var(--muted)]"
          onClick={() => {
            setChildName('');
            setAdding(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="wordmark text-xl text-royal dark:text-[var(--text)]">My Children</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Add your child to follow their day. You can add more than one.
        </p>
      </div>

      {adding ? addView : listView}
    </div>
  );
}
