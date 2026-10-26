import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';

import { fetchPullList } from '../api/pullLists';
import { ErrorState, LoadingState } from '../components/state';
import { useFlow } from '../hooks/useFlow';
import { useResolveRepo } from '../hooks/useResolveRepo';
import {
  PULL_DRAFT_FILTERS,
  draftCount,
  draftFilterLabel,
  filterByDraft,
  parseDraftFilter,
  type PullDraftFilter,
} from './pullDraftModel';
import { PULL_ORDER_PARAM } from './pullBaseGraphModel';
import { PullRequestListView } from './PullRequestListView';
import { PullRequestTimeline } from './PullRequestTimeline';
import { fromPullRequestSummary, groupPullRequests } from './pullRoomModel';

import './page.css';
import './PullRoomPage.css';

export interface RepositoryPullRequestsPageProps {
  provider?: string;
  fullName?: string;
}

export function RepositoryPullRequestsPage(props: RepositoryPullRequestsPageProps = {}): JSX.Element {
  const params = useParams();
  const provider = props.provider ?? params.provider ?? 'unknown';
  const fullName = props.fullName ?? params.fullName ?? '';
  const resolved = useResolveRepo(provider, fullName);
  const [search, setSearch] = useSearchParams();
  const view = search.get('view') === 'board' ? 'board' : 'timeline';
  const drafts = parseDraftFilter(search.get('drafts'));
  const state = parsePullState(search.get('state'));
  const q = search.get('q') ?? '';
  const query = (next: { view?: 'timeline' | 'board'; drafts?: PullDraftFilter; state?: PullState; q?: string }) => {
    const out: Record<string, string> = {};
    const wantView = next.view ?? view;
    const wantDrafts = next.drafts ?? drafts;
    if (wantView === 'board') out.view = wantView;
    if (wantDrafts !== 'all') out.drafts = wantDrafts;
    const wantState = next.state ?? state;
    const wantQ = next.q ?? q;
    if (wantState !== 'all') out.state = wantState;
    if (wantQ) out.q = wantQ;
    // The timeline's own order survives a view or filter switch.
    const order = search.get(PULL_ORDER_PARAM);
    if (order) out[PULL_ORDER_PARAM] = order;
    return out;
  };
  const setView = (next: 'timeline' | 'board') =>
    setSearch(query({ view: next }), { replace: true });
  const setDrafts = (next: PullDraftFilter) =>
    setSearch(query({ drafts: next }), { replace: true });
  const setState = (next: PullState) => setSearch(query({ state: next }), { replace: true });
  const setQ = (next: string) => setSearch(query({ q: next }), { replace: true });
  const repoId = resolved.data?.id ?? null;
  const flow = useFlow({});
  const pulls = useQuery({
    queryKey: ['repo-pulls', repoId],
    queryFn: ({ signal }) =>
      fetchPullList(repoId as string, undefined, signal),
    enabled: typeof repoId === 'string' && repoId.length > 0,
    staleTime: 15_000,
  });
  // Every pull request the repository has, whatever its base branch: the
  // default view narrows nothing, so a pull request into `rc/auto` is as
  // visible as one into the default branch. Only the draft filter narrows it.
  const all = pulls.data?.items ?? [];
  const shown = filterByDraft(all, drafts).filter((pr) =>
    (state === 'all' || pr.state === state) &&
    (!q || `${pr.title} ${pr.author} ${pr.number}`.toLowerCase().includes(q.toLowerCase()))
  );
  const openDrafts = draftCount(all);
  const lanes = groupPullRequests(shown.map((item) => fromPullRequestSummary(item)));

  if (resolved.isPending) {
    return (
      <div className="page" data-testid="repo-pulls-page">
        <LoadingState variant="message" title="Resolving repository." />
      </div>
    );
  }

  if (resolved.error || !resolved.data) {
    return (
      <div className="page" data-testid="repo-pulls-page">
        <header className="page__header">
          <h2 className="page__title">Pull requests</h2>
        </header>
        <ErrorState
          title="Could not resolve the repository."
          error={resolved.error}
          description={resolved.error ? undefined : `No repository ${fullName}.`}
          onRetry={resolved.refetch}
          testId="repo-pulls-resolve-error"
        />
      </div>
    );
  }

  return (
    <div className="page page--full pull-room" data-testid="repo-pulls-page">
      <header className="page__header pull-room__header">
        {/* The repository's own header, above its tabs, already names it. */}
        <h2 className="page__title">Pull requests</h2>
        <div className="pull-room__filters" role="group" aria-label="Draft filter">
          {PULL_DRAFT_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={drafts === filter}
              data-testid={`pull-filter-${filter}`}
              onClick={() => setDrafts(filter)}
            >
              {draftFilterLabel(filter)}
              {filter === 'drafts' && openDrafts > 0 ? ` (${openDrafts})` : ''}
            </button>
          ))}
        </div>
        <div className="pull-room__filters" role="group" aria-label="Pull request state">
          {PULL_STATES.map((filter) => (
            <button key={filter} type="button" aria-pressed={state === filter}
              data-testid={`pull-state-${filter}`} onClick={() => setState(filter)}>
              {filter === 'all' ? 'All states' : filter[0].toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
        <label>Search pull requests
          <input aria-label="Search pull requests" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <div className="pull-room__views" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>
            Timeline
          </button>
          <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>
            Board
          </button>
        </div>
      </header>
      {pulls.isPending ? (
        <LoadingState variant="message" title="Loading pull requests." />
      ) : pulls.isError ? (
        <ErrorState
          title="Could not load pull requests."
          error={pulls.error}
          onRetry={() => void pulls.refetch()}
          testId="repo-pulls-error"
        />
      ) : view === 'timeline' ? (
        <PullRequestTimeline pulls={shown} emptyMessage={emptyMessage(drafts, state, q)} flow={flow.data} />
      ) : (
        <PullRequestListView lanes={lanes} emptyMessage={emptyMessage(drafts, state, q)} />
      )}
    </div>
  );
}

type PullState = 'all' | 'open' | 'merged' | 'closed';
const PULL_STATES: readonly PullState[] = ['all', 'open', 'merged', 'closed'];
function parsePullState(value: string | null): PullState {
  return PULL_STATES.find((known) => known === value) ?? 'all';
}

/** The empty line says which filter is empty, not just "nothing here". */
function emptyMessage(filter: PullDraftFilter, state: PullState, q: string): string {
  if (q) return `No pull requests match "${q}"`;
  if (state !== 'all') return `No ${state} pull requests`;
  if (filter === 'drafts') return 'No draft pull requests';
  if (filter === 'ready') return 'No pull requests ready for review';
  return 'No pull requests';
}
