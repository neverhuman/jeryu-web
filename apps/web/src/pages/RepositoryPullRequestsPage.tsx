import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';

import { fetchPullList } from '../api/pullLists';
import { ErrorState, LoadingState } from '../components/state';
import { useResolveRepo } from '../hooks/useResolveRepo';
import {
  PULL_DRAFT_FILTERS,
  draftCount,
  draftFilterLabel,
  filterByDraft,
  parseDraftFilter,
  type PullDraftFilter,
} from './pullDraftModel';
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
  const query = (next: { view?: 'timeline' | 'board'; drafts?: PullDraftFilter }) => {
    const out: Record<string, string> = {};
    const wantView = next.view ?? view;
    const wantDrafts = next.drafts ?? drafts;
    if (wantView === 'board') out.view = wantView;
    if (wantDrafts !== 'all') out.drafts = wantDrafts;
    return out;
  };
  const setView = (next: 'timeline' | 'board') =>
    setSearch(query({ view: next }), { replace: true });
  const setDrafts = (next: PullDraftFilter) =>
    setSearch(query({ drafts: next }), { replace: true });
  const repoId = resolved.data?.id ?? null;
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
  const shown = filterByDraft(all, drafts);
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
          <h1 className="page__title">Pull requests</h1>
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
        <div>
          <h1 className="page__title">Pull requests</h1>
          <p className="page__subtitle">
            {resolved.data.summary.id.owner}/{resolved.data.summary.id.name}
          </p>
        </div>
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
        <PullRequestTimeline pulls={shown} emptyMessage={emptyMessage(drafts)} />
      ) : (
        <PullRequestListView lanes={lanes} emptyMessage={emptyMessage(drafts)} />
      )}
    </div>
  );
}

/** The empty line says which filter is empty, not just "nothing here". */
function emptyMessage(filter: PullDraftFilter): string {
  if (filter === 'drafts') return 'No draft pull requests';
  if (filter === 'ready') return 'No pull requests ready for review';
  return 'No pull requests';
}
