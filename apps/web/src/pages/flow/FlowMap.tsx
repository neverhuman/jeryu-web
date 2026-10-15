import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FlowReport } from '../../api/types';
import { runnersHref } from '../releaseBoard/links';
import { useFlowLayout } from './useFlowDetail';
import { STATION_GUIDE } from './stationGuide';
import { policyLabel, useFlowPolicy } from './useFlowPolicy';

interface Props {
  report: FlowReport;
  active: string | null;
  repo: string;
  journey: string[];
  onStation: (id: string, repo?: string) => void;
}
export function FlowMap({ report, active, repo, onStation, journey }: Props) {
  const layout = useFlowLayout();
  const repos = [
    ...new Set((report.repository_wip ?? []).map((row) => row.repo))
  ];
  const [picked, setPicked] = useState('');
  const source = repos.includes(picked)
    ? picked
    : repos.includes(repo) && !repo.endsWith('-deploy')
      ? repo
      : (repos.find((r) => r.endsWith('/jeryu-web')) ??
        repos.find((r) => !r.endsWith('-deploy')) ??
        repos[0] ??
        '');
  const candidate = `${source.split('/')[0]}/jeryu-deploy`;
  const shipper = source.endsWith('/jeryu-web') && repos.includes(candidate) ? candidate : '';
  const sourcePolicy = useFlowPolicy(source);
  const consumerPolicy = useFlowPolicy(shipper);
  const releaseRepo =
    shipper || (source.endsWith('/jeryu-deploy') ? source : '');
  const node = (id: string, at: string, secondary = false) => {
    const station = report.stations.find((s) => s.id === id);
    if (!station) return null;
    const wip = at
      ? report.repository_wip?.find((r) => r.repo === at && r.station === id)
      : station.wip;
    const tools = layout.data?.stations.find((s) => s.id === id)?.tools ?? [];
    return (
      <div className="flow-map__node-wrap" key={`${at}-${id}`}>
        <button
          type="button"
          key={`${at}-${id}`}
          className={`flow-map__node${active === id && (!repo || repo === at) ? ' is-active' : ''}${journey.includes(`${at}/${id}`) ? ' has-evidence' : ''}`}
          aria-pressed={active === id && (!repo || repo === at)}
          onClick={() => onStation(id, at)}
          data-testid={`flow-card-${secondary ? 'consumer-' : ''}${id}`}
        >
          <strong className="flow-card__label">{station.label}</strong>
          {policyLabel(id, at === shipper ? consumerPolicy : sourcePolicy) && (
            <small>
              {policyLabel(id, at === shipper ? consumerPolicy : sourcePolicy)}
            </small>
          )}
          <span>
            {wip ? `${wip.waiting} waiting · ${wip.active} running · ${wip.held} held` : report.repository_wip ? 'No open visits recorded' : 'Station counts unavailable'}
          </span>
        </button>
        <Link
          className="flow-map__service"
          to={
            tools.length
              ? runnersHref(tools.map((t) => t.runnerId))
              : '/runners'
          }
        >
          {tools.length
            ? `${STATION_GUIDE[id]?.automation} · reporting services`
            : 'Automation status unknown · inspect runners'}{' '}
          ↗
        </Link>
      </div>
    );
  };
  const cycle = (at: string, secondary = false) => (
    <div className="flow-map__cycle">
      <div className="flow-map__parallel">
        <span className="flow-map__edge">
          Pull request ready → applicable steps in parallel
        </span>
        {node('review', at, secondary)}
        {node('gate', at, secondary)}
      </div>
      <div className="flow-map__decision">
        <strong>
          ◇ Current revision satisfies configured merge requirements?
        </strong>
        <button type="button" onClick={() => onStation('work', at)}>
          Changes needed ↩ Work
        </button>
        <button type="button" onClick={() => onStation('gate', at)}>
          Execution failed ↩ repair + retry Gate
        </button>
        <span>
          Explicit human decision required → held; otherwise follow repository
          policy
        </span>
      </div>
      <div className="flow-map__forward">
        <span className="flow-map__edge">Yes →</span>
        {node('merge', at, secondary)}
      </div>
    </div>
  );
  return (
    <section
      className="flow-map"
      data-testid="flow-stations"
      aria-label="Change delivery map"
    >
      <div className="flow-map__legend">
        → Forward progress · ↩ Rework · ◇ Decision · ⏸ Intentional hold
      </div>
      {repos.length > 0 && (
        <label>
          Change repository{' '}
          <select
            value={source}
            onChange={(e) => setPicked(e.target.value)}
            aria-label="Change repository"
          >
            {repos.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      )}
      <div className="flow-map__lane">
        <h3>
          {source || 'Change repository'}{' '}
          <small>Implementation and pull request</small>
        </h3>
        <div className="flow-map__intake">
          {node('queue', source)}
          <span>→</span>
          {node('work', source)}
          <span>→</span>
          {node('shift', source)}
        </div>
        <p className="flow-map__edge">
          Shift publishes a pull request → · Direct pull requests enter below ↓
        </p>
        {cycle(source)}
      </div>
      {shipper ? (
        <>
          <div className="flow-map__handoff">
            {node('pin', shipper)}
            <p>
              ↓ New pull request in {shipper}. Its own configured review and
              checks apply; this is forward progress.
            </p>
          </div>
          <div className="flow-map__lane">
            <h3>
              {shipper} <small>Integration pull request</small>
            </h3>
            {cycle(shipper, true)}
          </div>
        </>
      ) : (
        <p className="flow-map__edge">
          After merge: the repository’s release or consumer route applies.
          Recorded delivery receipts appear in the item journey.
        </p>
      )}
      {releaseRepo && (
        <div className="flow-map__lane">
          <h3>
            Jeryu release and production{' '}
            <small>{shipper || 'For repositories with a release route'}</small>
          </h3>
          <div className="flow-map__release">
            {node('stage', releaseRepo)}
            <div className="flow-map__decision">
              <strong>◇ Build and verification passed?</strong>
              <span>No ↩ repair + retry Stage</span>
              <span>Yes → ⏸ awaiting activation authorization</span>
              <Link to="/releases">Inspect releases and authorization</Link>
            </div>
            {node('deploy', releaseRepo)}
            <div className="flow-map__decision">
              <strong>◇ Health and version verified?</strong>
              <span>Yes → running in production</span>
              <span>No → inspect evidence, repair or deliberate rollback</span>
            </div>
          </div>
        </div>
      )}
      {!releaseRepo && <div className="flow-map__lane">
        <h3>Recorded release stations <small>Route configuration unavailable</small></h3>
        <p>These stations remain inspectable. Their ordering and requirements depend on the repository’s release route.</p>
        <div className="flow-map__parallel">{node('pin',source)}{node('stage',source)}{node('deploy',source)}</div>
      </div>}
      <p className="flow__footnote">
        Requirements above describe current default-branch protection, not every
        repository-owned rule or historical policy. Unknown configuration is not
        a bypass. Release steps shown here describe the Jeryu release route.
      </p>
      <p className="flow__footnote">
        Counts are recorded open station visits. A change can occupy parallel
        stations. Missing signals can leave visits unresolved; these counts are
        not runner utilization.
      </p>
    </section>
  );
}
