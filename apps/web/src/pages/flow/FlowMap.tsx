// FlowMap — the family's delivery journey: every configured repository of a
// product flowing through its own review/gate route into the shared
// convergence point, its release and production.
//
// The topology comes from the server (`topology` in `GET /api/v1/flow`), which
// derives it from the family's manifests, pin locks and branch protection. The
// map therefore shows configured repositories with no work in flight, and it
// never decides a route from a repository's name. A server that does not
// report a topology leaves the recorded-visit view below, where the route
// requirements are read per repository from its branch rule instead.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FlowProduct, FlowReport, FlowRepoNode } from '../../api/types';
import { runnersHref } from '../releaseBoard/links';
import { useFlowLayout } from './useFlowDetail';
import { STATION_GUIDE } from './stationGuide';
import { policyLabel, useFlowPolicy } from './useFlowPolicy';
import {
  coverageWords,
  focusRepo,
  integrationWords,
  pinWords,
  productsInScope,
  routeWords,
  workWords
} from './topologyModel';

interface Props {
  report: FlowReport;
  active: string | null;
  repo: string;
  journey: string[];
  onStation: (id: string, repo?: string) => void;
}

export function FlowMap(props: Props) {
  const { report, repo } = props;
  const products = productsInScope(report, repo);
  if (!report.topology || products.length === 0) {
    return <RecordedMap {...props} />;
  }
  const coverage = coverageWords(report);
  return (
    <section
      className="flow-map"
      data-testid="flow-stations"
      aria-label="Family delivery journey"
    >
      <div className="flow-map__legend">
        → Forward progress · ↩ Rework · ◇ Decision · ⏸ Intentional hold
      </div>
      {report.topology.families.map((family) => (
        <p className="flow-map__family" key={family.family} data-testid={`flow-family-${family.family}`}>
          <strong>{family.family}</strong>{' '}
          <span>
            {family.products} product{family.products === 1 ? '' : 's'} ·{' '}
            {family.repos} configured repositor{family.repos === 1 ? 'y' : 'ies'} ·{' '}
            {workWords(family.work)}
          </span>
        </p>
      ))}
      {repo ? (
        <p className="flow-map__edge" data-testid="flow-drilldown">
          Repository drilldown: {repo}.{' '}
          <button type="button" onClick={() => props.onStation(props.active ?? 'work', '')}>
            Show the whole product
          </button>
        </p>
      ) : null}
      {products.map((product) => (
        <ProductLane
          key={`${product.family}/${product.id}`}
          product={product}
          scope={products.length > 1 ? product.id : ''}
          {...props}
        />
      ))}
      {coverage.length > 0 && (
        <div className="flow-map__coverage" data-testid="flow-topology-coverage">
          <strong>Configuration and evidence not available:</strong>
          <ul>
            {coverage.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      <Footnotes />
    </section>
  );
}

/** The station card for one repository at one station. */
function useStationCard(props: Props) {
  const layout = useFlowLayout();
  return function card(
    id: string,
    at: string,
    options: { secondary?: boolean; note?: string; scope?: string } = {}
  ) {
    const { report, active, repo, journey, onStation } = props;
    const station = report.stations.find((s) => s.id === id);
    if (!station) return null;
    const wip = at
      ? report.repository_wip?.find((r) => r.repo === at && r.station === id)
      : station.wip;
    const tools = layout.data?.stations.find((s) => s.id === id)?.tools ?? [];
    const selected = active === id && (!repo || repo === at);
    return (
      <div className="flow-map__node-wrap" key={`${at}-${id}`}>
        <button
          type="button"
          className={`flow-map__node${selected ? ' is-active' : ''}${journey.includes(`${at}/${id}`) ? ' has-evidence' : ''}`}
          aria-pressed={selected}
          onClick={() => onStation(id, at)}
          aria-label={`${station.label}${at ? ` · ${at}` : ''}`}
          data-testid={`flow-card-${options.secondary ? 'consumer-' : ''}${options.scope ? `${options.scope}-` : ''}${id}`}
        >
          <strong className="flow-card__label">{station.label}</strong>
          {options.note ? <small>{options.note}</small> : null}
          <span>
            {wip
              ? `${wip.waiting} waiting · ${wip.active} running · ${wip.held} held`
              : report.repository_wip
                ? 'No open visits recorded'
                : 'Station counts unavailable'}
          </span>
        </button>
        <Link
          className="flow-map__service"
          to={tools.length ? runnersHref(tools.map((t) => t.runnerId)) : '/runners'}
        >
          {tools.length
            ? `${STATION_GUIDE[id]?.automation} · reporting services`
            : 'Automation status unknown · inspect runners'}{' '}
          ↗
        </Link>
      </div>
    );
  };
}

/** One product: its contributing repositories, their convergence and release. */
function ProductLane({
  product,
  scope,
  ...props
}: Props & { product: FlowProduct; scope: string }) {
  const place = useStationCard(props);
  // Several products on one page would otherwise share one station's test id
  // and one accessible name; a scoped id keeps each product's own stations
  // addressable.
  const card = (
    id: string,
    at: string,
    options: { secondary?: boolean; note?: string } = {}
  ) => place(id, at, { ...options, scope });
  const focus = focusRepo(product, props.repo);
  const node = (at: string): FlowRepoNode | undefined =>
    product.repos.find((entry) => entry.repo === at);
  const integration = product.integration ?? '';
  const release = product.release?.repo ?? '';
  const cycle = (at: string, secondary = false) => (
    <div className="flow-map__cycle">
      <div className="flow-map__parallel">
        <span className="flow-map__edge">
          Pull request ready → applicable steps in parallel
        </span>
        {card('review', at, { secondary, note: routeWords('review', node(at)) })}
        {card('gate', at, { secondary, note: routeWords('gate', node(at)) })}
      </div>
      <div className="flow-map__decision">
        <strong>◇ Current revision satisfies configured merge requirements?</strong>
        <button type="button" onClick={() => props.onStation('work', at)}>
          Changes needed ↩ Work
        </button>
        <button type="button" onClick={() => props.onStation('gate', at)}>
          Execution failed ↩ repair + retry Gate
        </button>
        <span>
          Explicit human decision required → held; otherwise follow repository policy
        </span>
      </div>
      <div className="flow-map__forward">
        <span className="flow-map__edge">Yes →</span>
        {card('merge', at, { secondary })}
      </div>
    </div>
  );
  return (
    <div className="flow-map__product" data-testid={`flow-product-${product.id}`}>
      <h3>
        {product.label}{' '}
        <small>
          {product.source === 'family_default'
            ? 'one product per family (default)'
            : 'declared product group'}{' '}
          · {workWords(product.work)}
        </small>
      </h3>
      <ul className="flow-map__repos" aria-label={`Contributing repositories of ${product.label}`}>
        {product.repos.map((entry) => (
          <li
            key={entry.repo}
            data-testid={`flow-repo-${entry.repo}`}
            className={entry.repo === focus ? 'is-focus' : undefined}
          >
            <button type="button" onClick={() => props.onStation(props.active ?? 'work', entry.repo)}>
              {entry.repo}
            </button>
            <span className="flow-map__repo-badges">
              {entry.role === 'integration' ? <em>convergence point</em> : null}
              {entry.shared ? <em data-testid={`flow-shared-${entry.repo}`}>shared dependency</em> : null}
              {entry.no_current_work ? (
                <em>configured · no current work</em>
              ) : (
                <em>
                  {entry.active_lots} in flight
                </em>
              )}
            </span>
            <small>
              {routeWords('review', entry)} · {routeWords('gate', entry)} · {pinWords(entry)}
            </small>
          </li>
        ))}
      </ul>
      <div className="flow-map__lane">
        <h4>
          {focus || 'Contributing repository'} <small>Implementation and pull request</small>
        </h4>
        <div className="flow-map__intake">
          {card('queue', focus)}
          <span>→</span>
          {card('work', focus)}
          <span>→</span>
          {card('shift', focus)}
        </div>
        <p className="flow-map__edge">
          Shift publishes a pull request → · Direct pull requests enter below ↓
        </p>
        {cycle(focus)}
      </div>
      <div className="flow-map__handoff">
        <p data-testid={`flow-converge-${product.id}`}>↓ {integrationWords(product)}</p>
        {integration ? card('pin', integration) : card('pin', focus)}
      </div>
      {integration && integration !== focus ? (
        <div className="flow-map__lane">
          <h4>
            {integration} <small>Integration pull request</small>
          </h4>
          {cycle(integration, true)}
        </div>
      ) : null}
      {release ? (
        <div className="flow-map__lane">
          <h4>
            Release and production{' '}
            <small>
              {release} ·{' '}
              {product.release?.source === 'recorded_deliveries'
                ? 'from recorded deliveries'
                : 'from configuration'}
            </small>
          </h4>
          <div className="flow-map__release">
            {card('stage', release)}
            <div className="flow-map__decision">
              <strong>◇ Build and verification passed?</strong>
              <span>No ↩ repair + retry Stage</span>
              <span>Yes → ⏸ awaiting activation authorization</span>
              <Link to="/releases">Inspect releases and authorization</Link>
            </div>
            {card('deploy', release)}
            <div className="flow-map__decision">
              <strong>◇ Health and version verified?</strong>
              <span>Yes → running in production</span>
              <span>No → inspect evidence, repair or deliberate rollback</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flow-map__lane">
          <h4>
            Recorded release stations <small>Release route unavailable</small>
          </h4>
          <p>
            These stations remain inspectable. Their ordering and requirements depend on the
            product’s configured release route.
          </p>
          <div className="flow-map__parallel">
            {card('stage', focus)}
            {card('deploy', focus)}
          </div>
        </div>
      )}
    </div>
  );
}

function Footnotes() {
  return (
    <>
      <p className="flow__footnote">
        Routes above are the repositories’ current configuration, not every
        repository-owned rule or historical policy. Unknown configuration is not a bypass.
      </p>
      <p className="flow__footnote">
        Counts are recorded open station visits. A change can occupy parallel stations; product
        and family totals count one work item once. Missing signals can leave visits unresolved;
        these counts are not runner utilization.
      </p>
    </>
  );
}

/**
 * The view for a server that reports no topology: the repositories recorded
 * visits name, with each one's requirements read from its own branch rule.
 * Nothing here claims a chain between them.
 */
function RecordedMap(props: Props) {
  const { report, repo } = props;
  const card = useStationCard(props);
  const repos = [...new Set((report.repository_wip ?? []).map((row) => row.repo))];
  const [picked, setPicked] = useState('');
  const source = repos.includes(picked) ? picked : repos.includes(repo) ? repo : (repos[0] ?? '');
  const policy = useFlowPolicy(source);
  return (
    <section className="flow-map" data-testid="flow-stations" aria-label="Change delivery map">
      <div className="flow-map__legend">
        → Forward progress · ↩ Rework · ◇ Decision · ⏸ Intentional hold
      </div>
      <p className="flow-map__edge" data-testid="flow-topology-missing">
        Route configuration unavailable: this server does not report the family’s product
        topology, so only recorded repositories are shown and no delivery chain between them is
        claimed.
      </p>
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
          {source || 'Change repository'} <small>Implementation and pull request</small>
        </h3>
        <div className="flow-map__intake">
          {card('queue', source)}
          <span>→</span>
          {card('work', source)}
          <span>→</span>
          {card('shift', source)}
        </div>
        <div className="flow-map__parallel">
          {card('review', source, { note: policyLabel('review', policy) })}
          {card('gate', source, { note: policyLabel('gate', policy) })}
        </div>
        <div className="flow-map__decision">
          <strong>◇ Current revision satisfies configured merge requirements?</strong>
          <span>Changes needed ↩ Work · Execution failed ↩ repair + retry Gate</span>
        </div>
        {card('merge', source)}
      </div>
      <div className="flow-map__lane">
        <h3>
          Recorded release stations <small>Route configuration unavailable</small>
        </h3>
        <div className="flow-map__parallel">
          {card('pin', source)}
          {card('stage', source)}
          {card('deploy', source)}
        </div>
      </div>
      <Footnotes />
    </section>
  );
}
