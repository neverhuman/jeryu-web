// NeedsYouHere.tsx — the slice of "Needs you" that belongs to the page it sits
// on, shown above that page's own content: staged or failed releases on
// Releases, downed workers and gate runners on Runners, the Work share on Work.
// Every page a nav badge counts for shows this strip, so the badge always leads
// to the rows it counted. (In flight marks each pull request's own row instead.)
// It lists the rows /needs-you lists, from one shared query, so the left-nav
// count, this strip and that page always agree. Nothing waiting here renders
// nothing: calm pages stay calm.

import { Link } from 'react-router-dom';

import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { useAuth } from '../../hooks/useAuth';
import { useAttention } from '../../hooks/usePipeline';
import { AttentionRow, useRepoFamilies } from './AttentionRow';
import {
  AREA_LABEL,
  attentionSubjects,
  NEEDS_YOU_PATH,
  familyOf,
  filterByFamily,
  needsYouHref,
  severityTone,
  urgentInArea,
  type AttentionArea
} from './needsYouModel';

import './NeedsYou.css';

/** Rows shown before the strip hands over to /needs-you. */
const SHOWN = 5;

export function NeedsYouHere({
  area,
  family = '',
  onFamily
}: {
  area: AttentionArea;
  /** The page's own family filter, when it has one; the strip follows it. */
  family?: string;
  /** How the page narrows to a family; without it a pill opens /needs-you for that family. */
  onFamily?: (family: string) => void;
}): JSX.Element | null {
  const { user } = useAuth();
  // The one polled attention query, shared with the nav badge and Needs you.
  // The read is admin-only, so other roles never ask.
  const attention = useAttention(user?.role === 'admin');
  const repoFamilies = useRepoFamilies();
  const scope = useFamilyScope();

  // One row per subject here too, so this strip and /needs-you count the same
  // things: three items about one pull request are one row on both.
  const subjects = attentionSubjects(
    filterByFamily(urgentInArea(attention.data, area), family, repoFamilies)
  );
  if (subjects.length === 0) return null;

  const shown = subjects.slice(0, SHOWN);
  const more = subjects.length - shown.length;
  // Without a filter of its own, a pill takes the family to Needs you — as
  // the shell's scope, so the pages after it open on that family too.
  const pick =
    onFamily ?? ((next: string): void => scope.setFamily(next, { to: NEEDS_YOU_PATH }));
  const now = new Date();
  const title = `${subjects.length} waiting on you in ${AREA_LABEL[area]}`;

  return (
    <section
      className="needs-you__here"
      aria-label={title}
      data-testid={`needs-you-here-${area}`}
    >
      <h2 className="page__section-title">
        <span className="page__pill page__pill--danger">{subjects.length}</span>{' '}
        Waiting on you in {AREA_LABEL[area]}
        {/* The family the strip is showing stays on the link: Needs you opens
            on the same rows, not on every family's. */}
        <Link className="needs-you__here-all" to={needsYouHref(family)}>
          {more > 0 ? `${more} more in Needs you →` : 'All of Needs you →'}
        </Link>
      </h2>
      <ul className="needs-you__list">
        {shown.map((subject) => (
          <AttentionRow
            key={subject.key}
            subject={subject}
            tone={severityTone(subject.severity)}
            now={now}
            familyFor={(row) => familyOf(row, repoFamilies)}
            onPick={pick}
            picked={family}
          />
        ))}
      </ul>
    </section>
  );
}
