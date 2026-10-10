// OtherFamilies.tsx — "+N in other families", quietly.
//
// A scoped page must not hide how much of the fleet it is not showing: a
// person looking at one family still needs to know that eight runners or
// three flagged heads sit outside it, and that one click shows them. The line
// is a whisper, not a warning: it reports, it never alarms.

import { useFamilyScope } from './FamilyScopeProvider';

import './OtherFamilies.css';

export function OtherFamilies({
  count,
  noun,
  testId = 'family-scope-elsewhere',
}: {
  /** Rows the scope held back; nothing is said when it is 0. */
  count: number;
  /** What was held back, plural ("runners", "flagged heads"). */
  noun: string;
  testId?: string;
}): JSX.Element | null {
  const scope = useFamilyScope();
  if (count <= 0 || !scope.active) return null;
  return (
    <p className="other-families" data-testid={testId}>
      +{count} {noun} in other families.{' '}
      <button type="button" className="other-families__all" onClick={() => scope.clearFamily()}>
        Show all families
      </button>
    </p>
  );
}

/**
 * The same sentence as words, for a badge title or an aria-label: a count has
 * no room for a line of text, so it says it where a reader can hear it.
 */
export function otherFamiliesWords(count: number, noun: string): string {
  return count > 0 ? ` +${count} ${noun} in other families.` : '';
}
