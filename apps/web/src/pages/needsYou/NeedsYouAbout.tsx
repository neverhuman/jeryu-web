// NeedsYouAbout.tsx — the Needs-you row about the thing you are looking at,
// shown on that thing's own page: a todo's page, a pull request's page.
//
// `NeedsYouHere` is the same rows for a whole area; this is the slice about one
// subject, so the next step on a blocked todo or a failed queue entry is read
// and acted on in place. The rows come from the one shared `/api/v1/attention`
// query, so this, the strip and the left-nav count always agree. Nothing
// waiting renders nothing.

import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useAttention } from '../../hooks/usePipeline';
import { AttentionRow, useRepoFamilies } from './AttentionRow';
import {
  attentionAbout,
  familyOf,
  severityOf,
  severityTone,
  type AttentionSubject,
} from './needsYouModel';

import './NeedsYou.css';

export function NeedsYouAbout({
  subject,
  testId = 'needs-you-about',
}: {
  subject: AttentionSubject;
  testId?: string;
}): JSX.Element | null {
  const { user } = useAuth();
  const attention = useAttention(user?.role === 'admin');
  const repoFamilies = useRepoFamilies();
  const navigate = useNavigate();

  const items = attentionAbout(attention.data, subject);
  if (items.length === 0) return null;

  const now = new Date();
  return (
    <section
      className="needs-you__here"
      aria-label={`${items.length} waiting on you here`}
      data-testid={testId}
    >
      <h2 className="page__section-title">
        <span className="page__pill page__pill--danger">{items.length}</span> Waiting on you
      </h2>
      <ul className="needs-you__list">
        {items.map((item) => (
          <AttentionRow
            key={item.id}
            item={item}
            tone={severityTone(severityOf(item))}
            now={now}
            familyFor={(row) => familyOf(row, repoFamilies)}
            onPick={(family) => void navigate(`/needs-you?family=${encodeURIComponent(family)}`)}
            picked=""
          />
        ))}
      </ul>
    </section>
  );
}
