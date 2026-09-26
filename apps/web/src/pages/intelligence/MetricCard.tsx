// MetricCard.tsx - control-plane summary metric card.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { EvidenceState } from '../../api/types';

export function MetricCard({
  icon,
  label,
  value,
  detail,
  state,
  to,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  detail: string;
  state: EvidenceState;
  /** When set, the whole card links to this route. */
  to?: string;
}): JSX.Element {
  const body = (
    <>
      <div className="intelligence__metric-icon">{icon}</div>
      <div>
        <div className="intelligence__metric-label">{label}</div>
        <div className="intelligence__metric-value">{value}</div>
        <div className="intelligence__metric-detail">{detail}</div>
      </div>
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className={`intelligence__metric intelligence__metric--link is-${state}`}
        aria-label={`${label}: ${value}, ${detail}`}
      >
        {body}
      </Link>
    );
  }
  return <article className={`intelligence__metric is-${state}`}>{body}</article>;
}
