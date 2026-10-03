// NeedsYouAbout.tsx — the Needs-you row about the thing you are looking at,
// shown on that thing's own page: a todo's page, a pull request's page.
//
// `NeedsYouHere` is the same rows for a whole area; this is the slice about one
// subject, so the next step on a blocked todo or a failed queue entry is read
// and acted on in place. The rows come from the one shared `/api/v1/attention`
// query, so this, the strip and the left-nav count always agree. Nothing
// waiting renders nothing.

import { useNavigate } from 'react-router-dom';

import { pillClass } from '../../components/tone/tone';
import { useAuth } from '../../hooks/useAuth';
import { useAttention } from '../../hooks/usePipeline';
import { AttentionRow, useRepoFamilies } from './AttentionRow';
import {
  attentionAbout,
  familyOf,
  severityTone,
  type AboutSubject,
} from './needsYouModel';

import './NeedsYou.css';

export function NeedsYouAbout({
  subject,
  testId = 'needs-you-about',
}: {
  subject: AboutSubject;
  testId?: string;
}): JSX.Element | null {
  const { user } = useAuth();
  const attention = useAttention(user?.role === 'admin');
  const repoFamilies = useRepoFamilies();
  const navigate = useNavigate();

  const subjects = attentionAbout(attention.data, subject);
  if (subjects.length === 0) return null;

  const now = new Date();
  return (
    <section
      className="needs-you__here"
      aria-label={`${subjects.length} waiting on you here`}
      data-testid={testId}
    >
      <h2 className="page__section-title">
        <span className={pillClass('human')}>{subjects.length}</span> Waiting on you
      </h2>
      <ul className="needs-you__list">
        {subjects.map((row) => (
          <AttentionRow
            key={row.key}
            subject={row}
            tone={severityTone(row.severity)}
            now={now}
            familyFor={(item) => familyOf(item, repoFamilies)}
            onPick={(family) => void navigate(`/needs-you?family=${encodeURIComponent(family)}`)}
            picked=""
          />
        ))}
      </ul>
    </section>
  );
}
