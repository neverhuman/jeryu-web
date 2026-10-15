import { Link } from 'react-router-dom';

import type { ScorecardMetric } from '../../api/types';

interface MonthlyChecks {
  month: string;
  shipped: number;
  with_hypothesis: number;
  without_hypothesis: number;
  without_check_date: number;
  eligible: number;
  checked: number;
  met: number;
  checked_share_pct: number | null;
  met_share_pct: number | null;
}

interface CheckRow {
  id: string;
  family: string;
  title: string;
  href: string;
  hypothesis: string;
  outcome: string;
  outcome_note: string;
  check_due_at: string | null;
}

const percentage = (value: number | null): string => value === null ? '—' : `${value.toFixed(1)}%`;

export function HypothesisOutcomes({ metric }: { metric: ScorecardMetric }): JSX.Element | null {
  if (!metric.value || typeof metric.value !== 'object' || !('month' in metric.value)) return null;
  const value = metric.value as MonthlyChecks;
  const detail = metric.detail as { rows?: CheckRow[]; total_rows?: number } | null;
  const rows = detail?.rows ?? [];
  return (
    <section className="scorecard__hypotheses" aria-label="Monthly hypothesis checks" data-testid="monthly-hypotheses">
      <h3>Hypothesis checks · {value.month} (UTC)</h3>
      <p>
        {value.shipped} shipped · {value.with_hypothesis} with a hypothesis ·{' '}
        {value.without_hypothesis} without a hypothesis · {value.without_check_date} without a check date
      </p>
      <p>
        {value.checked} of {value.eligible} due checks recorded ({percentage(value.checked_share_pct)}) ·{' '}
        {value.met} met ({percentage(value.met_share_pct)} of checked)
      </p>
      <p>Checks belong to their scheduled month. Future dates are excluded until due. Unclear counts as checked.</p>
      <table>
        <caption>Work shipped or due for a check this month</caption>
        <thead>
          <tr>
            <th scope="col">Todo</th>
            <th scope="col">Hypothesis</th>
            <th scope="col">Check date</th>
            <th scope="col">Outcome</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.family}:${row.id}`}>
              <td><Link to={row.href}>{row.title}</Link></td>
              <td>{row.hypothesis || 'No hypothesis'}</td>
              <td>{row.check_due_at?.slice(0, 10) ?? 'No date'}</td>
              <td>{row.outcome.replaceAll('_', ' ')}</td>
              <td>{row.outcome_note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p>No shipped work or due checks recorded this month.</p> : null}
      {(detail?.total_rows ?? 0) > rows.length ? (
        <p>Showing {rows.length} of {detail?.total_rows} todos. Counts include all matching todos.</p>
      ) : null}
    </section>
  );
}
