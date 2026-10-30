import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { PageHeader, queryFreshness } from '../../components/pageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { useRepositories } from '../../hooks/useRepositories';
import { useResolveRepo } from '../../hooks/useResolveRepo';
import { useLineage } from '../../hooks/useDeliveryEvidence';
import { useRepoPullLists } from '../../hooks/useRepoPullLists';
import { usePageTitle } from '../../hooks/usePageTitle';
import type { RepositorySummary } from '../../api/types';
import { repoFrontPath } from '../repoBrowserModel';
import { CommitGraph } from './CommitGraph';
import { lineagePath } from './model';
import '../delivery.css';
import '../page.css';

export function LineagePage() {
  usePageTitle('Lineage');
  const scope = useFamilyScope();
  const [showAll, setShowAll] = useState(false);
  const query = useRepositories({ family: scope.family || undefined, sort: 'recent_activity' });
  const repositories = query.data?.repositories ?? [];
  const active = repositories.filter(repo => repo.open_pull_requests > 0);
  const visible = (showAll ? repositories : active).slice(0, 50);
  return <div className="page page--wide" data-testid="lineage-page">
    <PageHeader title="Lineage" freshness={queryFreshness(query)} actions={<Link to={scope.scopedPath('/releases?tab=builds')}>Builds</Link>} />
    {query.isPending ? <LoadingState title="Loading repositories…" /> : query.error ? <ErrorState title="Could not load repositories" error={query.error} onRetry={() => void query.refetch()} /> : <>
      <div className="delivery-controls"><label><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} /> Include repositories without open pull requests</label></div>
      {!visible.length && <EmptyState title="No open pull requests in this scope" description="Include other repositories to inspect recent branch work." />}
      {visible.map((repo, index) => <RepositoryLineage key={repo.id.id} repo={repo} initiallyOpen={index < 3} />)}
      {repositories.length > 50 && showAll && <p className="delivery-muted">Showing the 50 most recently active repositories. Find another in <Link to={scope.scopedPath('/repos')}>Repositories</Link>.</p>}
    </>}
  </div>;
}
function RepositoryLineage({ repo, initiallyOpen }: { repo: RepositorySummary; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const name = `${repo.id.owner}/${repo.id.name}`;
  return <section className="lineage-repository">
    <div className="lineage-repository__head"><h2><Link to={lineagePath(repo.id.host, repo.id.owner, repo.id.name)}>{name}</Link></h2><span>{repo.open_pull_requests} open pull requests</span><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide ancestry' : 'Show ancestry'}</button></div>
    {open && <RepositoryEvidence provider={repo.id.host} fullName={name} repoId={repo.id.id} compact />}
  </section>;
}
export function RepositoryLineagePage({ provider, fullName }: { provider: string; fullName: string }) {
  const resolved = useResolveRepo(provider, fullName);
  usePageTitle(`${fullName} · Lineage`);
  if (resolved.isPending) return <LoadingState title="Loading repository…" />;
  if (resolved.error) return <ErrorState title="Could not load repository" error={resolved.error} />;
  if (!resolved.data) return <EmptyState title="Repository not found" />;
  return <div className="page page--wide" data-testid="repository-lineage-page"><RepositoryEvidence provider={provider} fullName={fullName} repoId={resolved.data.id} /></div>;
}
function RepositoryEvidence({ provider, fullName, repoId, compact = false }: { provider: string; fullName: string; repoId: string; compact?: boolean }) {
  const scope = useFamilyScope();
  const query = useLineage(repoId);
  const pulls = useRepoPullLists([fullName], 'open', 60_000);
  if (query.isPending) return <LoadingState title="Loading commit ancestry…" />;
  if (query.error) return <ErrorState title="Could not load commit ancestry" error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  return <>
    <div className="delivery-controls"><Link to={`/in-flight?repo=${encodeURIComponent(fullName)}&order=base`}>Pull requests</Link><Link to={scope.scopedPath("/flow")}>Flow</Link><Link to={scope.scopedPath("/releases?tab=builds")}>Builds</Link><span className="delivery-muted">{query.data.default_branch} · {query.data.branches.length} active branches</span></div>
    <div className="lineage-branches">{query.data.branches.map(branch => {
      const pull = pulls.pulls.find(p => p.number === branch.pull_number);
      return <details key={branch.name}><summary><code>{branch.name}</code> · {branch.draft ? 'Draft' : branch.pull_number ? `Pull request #${branch.pull_number}` : 'No pull request'}{branch.relation === 'diverged' ? ' · Diverged' : ''}{pull ? pull.mergeable.can_merge ? ' · Ready' : ' · Waiting' : ''}</summary>
        <p>{branch.pull_title ?? branch.name}</p><p>Target: {branch.base_ref ?? query.data?.default_branch} · Ancestry: {branch.relation}</p>
        {pull && <p>{pull.mergeable.can_merge ? "Ready to merge" : pull.mergeable.reason ?? "Merge readiness unknown"}</p>}
        {branch.pull_number && <Link to={`${repoFrontPath(provider, fullName)}/pulls/${branch.pull_number}`}>Open pull request and blockers</Link>}
      </details>;
    })}</div>
    {!!pulls.failed.length && <p role="status">Pull request status could not be read. Commit ancestry is still available.</p>}
    <CommitGraph key={repoId} graph={query.data} provider={provider} initialShown={compact ? 12 : 50} />
  </>;
}
