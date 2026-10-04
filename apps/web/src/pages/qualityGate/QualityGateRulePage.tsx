// QualityGateRulePage.tsx — one rule's flagged heads, at
// `/quality-gate/rules/:rule`.
//
// The middle step of the drill-down: Quality gate → rule → a scored head. Each
// row is a head the rule raised a finding on, newest first, and leads to that
// head's score detail.

import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState, LoadingState } from '../../components/state';
import { useQualityGateRule } from '../../hooks/useQualityGate';
import { QualityGateQueryState } from './QualityGateQueryState';
import {
  QUALITY_GATE_PATH,
  qualityGateHeadPath,
  shortSha,
} from './qualityGateModel';
import { usePageTitle } from '../../hooks/usePageTitle';
import '../page.css';
import './QualityGate.css';
import { When } from '../../format/When';

export function QualityGateRulePage(): JSX.Element {
  const { rule = '' } = useParams();
  usePageTitle(rule ? `${rule} · Quality gate` : 'Quality gate');
  const { data, isPending, isError, error } = useQualityGateRule(rule);

  return (
    <div className="page page--wide" data-testid="quality-gate-rule-page">
      <header className="page__header">
        <Link className="quality-gate__back" to={QUALITY_GATE_PATH}>
          <ChevronLeft aria-hidden="true" size={14} />
          Quality gate
        </Link>
        <h1 className="page__title">{data?.title ?? rule}</h1>
        <p className="page__subtitle">
          <code>{rule}</code>
          {data ? ` — ${data.description}` : null}
        </p>
      </header>

      {isPending ? (
        <LoadingState title="Loading the flagged heads…" variant="message" />
      ) : isError ? (
        <QualityGateQueryState what={`the heads ${rule} flagged`} error={error} />
      ) : data.heads.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="This rule flagged nothing in the window."
          description={`No head scored in the last ${data.window_days} days carries a finding from this rule.`}
        />
      ) : (
        <section className="page__section" aria-labelledby="quality-gate-heads">
          <h2 className="page__section-title" id="quality-gate-heads">
            Flagged heads
          </h2>
          <div className="table-scroll">
            <table className="quality-gate__table" data-testid="quality-gate-heads-table">
              <thead>
                <tr>
                  <th scope="col">Head</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Scored</th>
                  <th scope="col" className="quality-gate__num">
                    Score
                  </th>
                  <th scope="col" className="quality-gate__num">
                    Findings
                  </th>
                  <th scope="col" className="quality-gate__num">
                    Disputed
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.heads.map((head) => (
                  <tr
                    key={`${head.repo}@${head.sha}`}
                    data-testid={`quality-gate-head-${head.repo}@${shortSha(head.sha)}`}
                  >
                    <td>
                      <Link to={qualityGateHeadPath(head.repo, head.sha)}>
                        {head.repo}@{shortSha(head.sha)}
                      </Link>
                    </td>
                    <td>{head.branch}</td>
                    <td>
                      <When at={head.scored_at} />
                    </td>
                    <td className="quality-gate__num">
                      <span
                        className={
                          head.score < head.threshold
                            ? 'page__pill page__pill--danger'
                            : 'page__pill page__pill--success'
                        }
                      >
                        {head.score} / {head.threshold}
                      </span>
                    </td>
                    <td className="quality-gate__num">{head.findings}</td>
                    <td className="quality-gate__num">{head.disputes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
