// QualityGatePage.tsx — Quality gate overview, at `/quality-gate`.
//
// The `jankurai/proof` gate is scored on every head but is not required yet.
// This page is how an operator decides whether it should be: how often it
// would have blocked a push, which rules do the blocking, where they land, and
// how often the operator reading a finding disagreed with it.
//
// One obvious action: open the rule that fails most often.

import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { QualityGateOverview } from '../../api/types';
import { EmptyState, LoadingState } from '../../components/state';
import { useQualityGateOverview, QUALITY_GATE_WINDOW_DAYS } from '../../hooks/useQualityGate';
import { QualityGateChart } from './QualityGateChart';
import { QualityGateQueryState } from './QualityGateQueryState';
import {
  percent,
  qualityGateRulePath,
  sortRepos,
  sortRules,
  topFailingRule,
  windowSummary,
} from './qualityGateModel';
import '../page.css';
import './QualityGate.css';

function Tile({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: string;
  detail: string;
  testId: string;
}): JSX.Element {
  return (
    <article className="quality-gate__tile" data-testid={testId}>
      <div className="quality-gate__tile-label">{label}</div>
      <div className="quality-gate__tile-value">{value}</div>
      <div className="quality-gate__tile-detail">{detail}</div>
    </article>
  );
}

export function QualityGatePage(): JSX.Element {
  const { data, isPending, isError, error } = useQualityGateOverview();

  return (
    <div className="page page--wide" data-testid="quality-gate-page">
      <header className="page__header">
        <h1 className="page__title">Quality gate</h1>
        <p className="page__subtitle">
          How the <code>jankurai/proof</code> score behaves on every head that is
          scored. The gate is watched, not required: this is what it would have
          blocked over the last {QUALITY_GATE_WINDOW_DAYS} days, and how often
          the person reading a finding disagreed with it.
        </p>
      </header>

      {isPending ? (
        <LoadingState title="Loading the quality gate overview…" variant="message" />
      ) : isError ? (
        <QualityGateQueryState what="the quality gate overview" error={error} />
      ) : data.heads_scored === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No head has been scored yet."
          description={`Nothing was scored in the last ${data.window_days} days. Scores appear here on the next push.`}
        />
      ) : (
        <QualityGateOverviewBody data={data} />
      )}
    </div>
  );
}

function QualityGateOverviewBody({
  data,
}: {
  data: QualityGateOverview;
}): JSX.Element {
  const rules = sortRules(data.rules);
  const repos = sortRepos(data.repos);
  const top = topFailingRule(data.rules);

  return (
    <>
      <section className="page__section" aria-labelledby="quality-gate-summary">
        <h2 className="page__section-title" id="quality-gate-summary">
          Last {data.window_days} days
        </h2>
        <div className="quality-gate__tiles">
          <Tile
            testId="quality-gate-tile-fail-rate"
            label="Fail rate"
            value={percent(data.fail_rate, data.heads_scored)}
            detail={`of ${data.heads_scored} scored head${data.heads_scored === 1 ? '' : 's'}`}
          />
          <Tile
            testId="quality-gate-tile-would-block"
            label="Would have blocked"
            value={String(data.heads_failed)}
            detail="heads, had the gate been required"
          />
          <Tile
            testId="quality-gate-tile-disputes"
            label="Disputed findings"
            value={String(data.disputes)}
            detail="findings an admin marked as wrong"
          />
        </div>
        <p className="quality-gate__summary">
          {windowSummary(data.window_days, data.heads_scored, data.heads_failed)}
        </p>
        {top ? (
          <Link
            className="quality-gate__action"
            data-testid="quality-gate-top-rule"
            to={qualityGateRulePath(top.rule)}
          >
            Open {top.rule}, the rule failing most often
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        ) : null}
      </section>

      <section className="page__section" aria-labelledby="quality-gate-daily">
        <h2 className="page__section-title" id="quality-gate-daily">
          Scored heads per day
        </h2>
        <QualityGateChart days={data.daily} />
      </section>

      <section className="page__section" aria-labelledby="quality-gate-rules">
        <h2 className="page__section-title" id="quality-gate-rules">
          Failures by rule
        </h2>
        <table className="quality-gate__table" data-testid="quality-gate-rules-table">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col" className="quality-gate__num">
                Findings
              </th>
              <th scope="col" className="quality-gate__num">
                Repositories
              </th>
              <th scope="col" className="quality-gate__num">
                Disputed
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.rule} data-testid={`quality-gate-rule-${rule.rule}`}>
                <td>
                  <Link to={qualityGateRulePath(rule.rule)}>{rule.rule}</Link>
                  <span className="quality-gate__rule-title">{rule.title}</span>
                </td>
                <td className="quality-gate__num">{rule.failures}</td>
                <td className="quality-gate__num">{rule.repos}</td>
                <td className="quality-gate__num">
                  {percent(rule.dispute_rate, rule.failures)}
                  <span className="quality-gate__sub">{rule.disputes}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="page__section" aria-labelledby="quality-gate-repos">
        <h2 className="page__section-title" id="quality-gate-repos">
          Failures by repository
        </h2>
        <table className="quality-gate__table" data-testid="quality-gate-repos-table">
          <thead>
            <tr>
              <th scope="col">Repository</th>
              <th scope="col" className="quality-gate__num">
                Scored
              </th>
              <th scope="col" className="quality-gate__num">
                Below the floor
              </th>
              <th scope="col" className="quality-gate__num">
                Fail rate
              </th>
              <th scope="col">Rule failing most</th>
            </tr>
          </thead>
          <tbody>
            {repos.map((repo) => (
              <tr key={repo.repo} data-testid={`quality-gate-repo-${repo.repo}`}>
                <td>
                  <Link to={`/repos/jeryu/${repo.repo}`}>{repo.repo}</Link>
                </td>
                <td className="quality-gate__num">{repo.heads_scored}</td>
                <td className="quality-gate__num">{repo.heads_failed}</td>
                <td className="quality-gate__num">
                  {percent(repo.fail_rate, repo.heads_scored)}
                </td>
                <td>
                  {repo.top_rule ? (
                    <Link to={qualityGateRulePath(repo.top_rule)}>{repo.top_rule}</Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
