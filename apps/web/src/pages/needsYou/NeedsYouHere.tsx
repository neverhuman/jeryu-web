// NeedsYouHere.tsx — the slice of Needs you (All) that belongs to the page it
// sits on, shown above that page's own content: the Work share on Work.
// Releases and Runners no longer carry one — their rows are on Needs you,
// which their nav badges count. (In flight marks each pull request's own row
// instead.) It lists the rows the All tab lists, from one shared query, so the
// left-nav count, this strip and that page always agree. Nothing waiting here
// renders nothing: calm pages stay calm.

import { Link } from 'react-router-dom';

import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { pillClass } from '../../components/tone/tone';
import { useAuth } from '../../hooks/useAuth';
import { useAttention } from '../../hooks/usePipeline';
import { AttentionRow, useRepoFamilies } from './AttentionRow';
import {
  AREA_LABEL,
  attentionSubjects,
  BLOCKED_PATH,
  familyOf,
  filterByFamily,
  filterByRepos,
  blockedHref,
  severityTone,
  urgentInArea,
  type AttentionArea
} from './needsYouModel';

import './NeedsYou.css';

/** Rows shown before the strip hands over to /blocked. */
const SHOWN = 5;

export function NeedsYouHere({
  area,
  family = '',
  repos,
  onFamily
}: {
  area: AttentionArea;
  /** The page's own family filter, when it has one; the strip follows it. */
  family?: string;
  /**
   * The repositories the page is scoped to, when it is scoped to any: a row
   * about another repository is not what that page is waiting on.
   */
  repos?: readonly string[] | null;
  /** How the page narrows to a family; without it a pill opens /blocked for that family. */
  onFamily?: (family: string) => void;
}): JSX.Element | null {
  const { user } = useAuth();
  // The one polled attention query, shared with the nav badge and Blocked.
  // The read is admin-only, so other roles never ask.
  const attention = useAttention(user?.role === 'admin');
  const repoFamilies = useRepoFamilies();
  const scope = useFamilyScope();

  // One row per subject here too, so this strip and /blocked count the same
  // things: three items about one pull request are one row on both.
  const subjects = attentionSubjects(
    filterByRepos(
      filterByFamily(urgentInArea(attention.data, area), family, repoFamilies),
      repos
    )
  );
  if (subjects.length === 0) return null;

  const shown = subjects.slice(0, SHOWN);
  const more = subjects.length - shown.length;
  // Without a filter of its own, a pill takes the family to Blocked — as
  // the shell's scope, so the pages after it open on that family too.
  const pick =
    onFamily ?? ((next: string): void => scope.setFamily(next, { to: BLOCKED_PATH }));
  const now = new Date();
  const title = `${subjects.length} blocked in ${AREA_LABEL[area]}`;

  return (
    <section
      className="needs-you__here"
      aria-label={title}
      data-testid={`needs-you-here-${area}`}
    >
      <h2 className="page__section-title">
        <span className={pillClass('human')}>{subjects.length}</span>{' '}
        Blocked in {AREA_LABEL[area]}
        {/* The family the strip is showing stays on the link: Blocked opens
            on the same rows, not on every family's. */}
        <Link className="needs-you__here-all" to={blockedHref(family)}>
          {more > 0 ? `${more} more in Blocked →` : 'All of Blocked →'}
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
