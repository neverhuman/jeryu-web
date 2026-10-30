import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { BuildPlacement, CandidateBuild } from '../../api/types/delivery';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { useBuildInventory } from '../../hooks/useDeliveryEvidence';
import { useListKeys, listRowProps, LIST_OPEN_PROP } from '../../hooks/useListKeys';
import { When } from '../../format/When';
import { safeLogUrl } from '../releasesModel';
import { lineagePath } from '../lineage/model';
import { candidateWindow, runningTargets } from './model';
import '../delivery.css';

export function BuildsPanel({ family }: { family: string }) {
  const [params, setParams] = useSearchParams();
  const deliverable = params.get('deliverable') ?? '';
  const query = useBuildInventory(family, deliverable);
  const [older, setOlder] = useState(false);
  const [shown, setShown] = useState(50);
  const keys = useListKeys<HTMLDivElement>();
  const data = query.data?.pages[0];
  const builds = query.data?.pages.flatMap(page => page.builds) ?? [];
  const picked = data?.deliverable ?? '';
  const placements = data?.placements ?? [];
  const imageLocations = [...new Set(builds.flatMap(build => build.artifacts.map(artifact => artifact.repository)))];
  const commonImage = imageLocations.length === 1 && builds.every(build => build.artifacts.length <= 1) ? imageLocations[0] : null;
  const window = candidateWindow(builds, placements, picked, older);
  const stale = !!data?.placements_observed_at && query.dataUpdatedAt - Date.parse(data.placements_observed_at) > 15 * 60_000;
  const select = (value: string) => { const next = new URLSearchParams(params); next.set('deliverable', value); setParams(next); setOlder(false); setShown(50); };
  return <section data-testid="builds-panel" aria-label="Build candidates">
    {query.isPending ? <LoadingState title="Loading builds…" /> : query.error ? <ErrorState title="Could not load builds" error={query.error} onRetry={() => void query.refetch()} /> : !data?.total ? <EmptyState title="No builds reported yet" description="Builds appear here when the release collector reports them." /> : <>
      <div className="delivery-controls"><label>Deliverable <select aria-label="Deliverable" value={picked} onChange={event => select(event.target.value)}>{data.deliverables.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><input type="checkbox" checked={older} onChange={event => { setOlder(event.target.checked); setShown(50); }} /> Older history</label>
        <span className="delivery-muted">Newest first · {data.total} builds</span><button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh</button>
      </div>
      {commonImage && commonImage !== picked && <p className="delivery-muted">Image: <code>{commonImage}</code></p>}
      {data.placements_observed_at ? <p className="delivery-muted" role={stale ? 'status' : undefined}>Environment report: <When at={data.placements_observed_at} />{stale ? ' · Needs refresh; running versions are unconfirmed.' : ''}</p> : <p className="delivery-muted" role="status">Running environments have not been reported.</p>}
      {!window.boundaryLoaded && <p className="delivery-muted">{query.hasNextPage ? 'Load earlier builds to reach previous production.' : 'Previous production has not been established for every target.'}</p>}
      <div className="build-list-head" aria-hidden="true"><span>Candidate</span><span>{commonImage ? "Tags" : "Image / tags"}</span><span>Running in (reported)</span><span>Build status</span></div>
      <div ref={keys}>{window.rows.slice(0, shown).map((build, index) => <BuildRow key={build.id} build={build} placements={placements} production={window.current.has(build.id)} previous={window.previous.has(build.id)} newest={index === 0} stale={stale} commonImage={commonImage} />)}</div>
      {window.rows.length > shown ? <button type="button" onClick={() => setShown(value => value + 50)}>Show more builds</button> : query.hasNextPage && (older || !window.boundaryLoaded) ? <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load earlier builds</button> : null}
      {!older && window.boundaryLoaded && <p className="delivery-muted">Showing through previous production. {window.hidden ? `${window.hidden} earlier builds loaded.` : ''}</p>}
    </>}
  </section>;
}
function BuildRow({ build, placements, production, previous, newest, stale, commonImage }: { build: CandidateBuild; placements: BuildPlacement[]; production: boolean; previous: boolean; newest: boolean; stale: boolean; commonImage: string | null }) {
  const [open, setOpen] = useState(false);
  const running = runningTargets(build, placements);
  const environments = [...new Set(running.map(target => target.environment))];
  const [owner = '', repo = ''] = build.source_repo.split('/');
  const log = safeLogUrl(build.log_url);
  return <details {...listRowProps} data-list-key={build.id} className={`build-candidate${production ? ' build-candidate--production' : ''}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary {...LIST_OPEN_PROP}>
      <span><span className="build-candidate__identity"><strong title={build.id}>{build.id.startsWith("sha256:") ? build.id.slice(0, 19) : build.id}</strong>{newest && <span className="page__pill">Newest</span>}{production && <span className="page__pill">Current prod</span>}{previous && <span className="page__pill">Previous prod</span>}</span><span className="delivery-muted"><When at={build.built_at} /></span></span>
      <span className="build-candidate__location">{build.artifacts.length ? <>{!commonImage && <code>{build.artifacts[0].repository}</code>}{build.artifacts.length > 1 && <span> +{build.artifacts.length - 1}</span>}<span className="build-candidate__tags">{build.artifacts[0].tags.slice(0, 3).map(tag => <span key={tag} className="page__pill">{tag}</span>)}{build.artifacts[0].tags.length > 3 && <span>+{build.artifacts[0].tags.length - 3}</span>}</span></> : <span title="No image reported">—</span>}</span>
      <span>{environments.length ? environments.join(', ') : <span title="No environment reported running this build">—</span>}{stale && environments.length > 0 ? ' · unconfirmed' : ''}</span>
      <span>{build.status}</span>
    </summary>
    {open && <div className="build-candidate__detail">
      <dl><dt>Source</dt><dd><Link to={lineagePath('jeryu', owner, repo, build.source_sha)}>{build.source_repo} · {build.source_sha.slice(0, 12)}</Link></dd><dt>Build observed</dt><dd><When at={build.observed_at} /></dd></dl>
      {build.artifacts.map((artifact, index) => <div key={`${artifact.repository}:${artifact.digest}:${index}`}><h3>{artifact.repository}</h3><CopyCommand command={`${artifact.repository}@${artifact.digest}`} label="image reference" /><p>Tags: {artifact.tags.length ? artifact.tags.join(', ') : 'None reported'}</p></div>)}
      {running.length > 0 && <><h3>Reported running targets</h3><ul>{running.map(target => <li key={`${target.environment}:${target.target}`}>{target.environment} · {target.target}</li>)}</ul></>}
      {log && <p><a href={log}>Build log</a></p>}
    </div>}
  </details>;
}
