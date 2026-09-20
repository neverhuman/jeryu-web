import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { EvidenceState, PullRequestSummary } from '../api/types';
import { useControlPlane } from '../hooks/useControlPlane';
import { useRepoChannels, EMPTY_CHANNELS } from '../hooks/useRepoChannels';
import { useRepoPullLists } from '../hooks/useRepoPullLists';
import { useRepositories } from '../hooks/useRepositories';
import { useShiftTodos } from '../hooks/useShift';
import { PullRequestListView } from './PullRequestListView';
import { PullRequestTimeline } from './PullRequestTimeline';
import { awaitingReleaseCount } from './pullBandsModel';
import { pullGhostGroups, type GhostGroup } from './pullGhostsModel';
import { releaseLadder } from './releaseChannelsModel';
import {
  ACTIVE_STATE_FILTER,
  DEFAULT_PULL_ROOM_FILTERS,
  familyLabel,
  familyPills,
  filterPullRequests,
  filterPullSummaries,
  fromControlPullRequest,
  groupPullRequests,
  isBoardView,
  pullListState,
  repoOptions,
  reposToLoad,
  scopeToFamily,
  type PullRoomFilters,
} from './pullRoomModel';
import { timelineSentence } from './pullTimelineModel';

import './page.css';
import './PullRoomPage.css';

/** Checks, reviews and merges move without this tab doing anything: poll. */
const REFRESH_MS = 30_000;

const EVIDENCE_STATES: EvidenceState[] = [
  'fresh',
  'missing',
  'queued',
  'failed',
  'unknown',
];

export function PullRoomPage(): JSX.Element {
  const snapshot = useControlPlane({ refetchInterval: REFRESH_MS });
  const [searchParams, setSearchParams] = useSearchParams();
  const [localFilters, setFilters] = useState<PullRoomFilters>(DEFAULT_PULL_ROOM_FILTERS);
  // Keep the repository in the URL so shared links and history update the results.
  const repo = searchParams.get('repo') || DEFAULT_PULL_ROOM_FILTERS.repo;
  const filters = useMemo(() => ({ ...localFilters, repo }), [localFilters, repo]);
  // Five controls for a handful of pull requests is more to read than the list
  // itself: they fold away unless one of them is doing something.
  const filtersActive =
    filters.repo !== DEFAULT_PULL_ROOM_FILTERS.repo ||
    filters.state !== DEFAULT_PULL_ROOM_FILTERS.state ||
    filters.evidence !== DEFAULT_PULL_ROOM_FILTERS.evidence ||
    filters.checkPosture !== DEFAULT_PULL_ROOM_FILTERS.checkPosture ||
    filters.search !== DEFAULT_PULL_ROOM_FILTERS.search;
  const [filtersOpen, setFiltersOpen] = useState(filtersActive);
  // `?family=` scopes everything on the page to that family's repos. The
  // repository list (already cached for /repos) says which family a repo is in.
  const family = searchParams.get('family') ?? '';
  const repositories = useRepositories({});
  const families = useMemo(
    () =>
      new Map(
        (repositories.data?.repositories ?? []).map((member) => [
          `${member.id.owner}/${member.id.name}`,
          member.family ?? null,
        ])
      ),
    [repositories.data]
  );
  const setFamily = (value: string): void => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('family', value);
    else params.delete('family');
    setSearchParams(params);
  };
  const setRepo = (value: string): void => {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('repo');
    else params.set('repo', value);
    setSearchParams(params, { replace: true });
  };
  // The timeline is the page; the lane board stays one click away.
  const board = isBoardView(searchParams.get('view'));
  const setBoard = (next: boolean): void => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('view', 'board');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  // The board shows work in flight. The timeline is a history — its bands run
  // from work that has not merged yet down to what production runs — so its
  // default asks for merged and closed pull requests too.
  const viewFilters = useMemo(
    () =>
      board || filters.state !== ACTIVE_STATE_FILTER ? filters : { ...filters, state: 'all' },
    [board, filters]
  );

  const everything = useMemo(
    () => snapshot.data?.pullRequests.map(fromControlPullRequest) ?? [],
    [snapshot.data]
  );
  const pills = useMemo(() => familyPills(everything, families), [everything, families]);
  const items = useMemo(
    () => scopeToFamily(everything, family, families),
    [everything, family, families]
  );
  const filtered = useMemo(
    () => filterPullRequests(items, filters),
    [filters, items]
  );
  const lanes = useMemo(() => groupPullRequests(filtered), [filtered]);
  const repos = useMemo(() => repoOptions(items), [items]);
  // The snapshot says which repositories hold a matching pull request; only
  // those are asked for their lists, which carry review and merge state.
  const wanted = useMemo(
    () => reposToLoad(filterPullRequests(items, viewFilters)),
    [items, viewFilters]
  );
  const lists = useRepoPullLists(
    board ? [] : wanted.repos,
    pullListState(viewFilters.state),
    REFRESH_MS
  );
  const rows = useMemo(
    () => filterPullSummaries(lists.pulls, viewFilters),
    [viewFilters, lists.pulls]
  );

  // Where every merged change has got to: dev, canary, stable, production.
  const channels = useRepoChannels(board ? [] : wanted.repos);
  const ladderFor = (pr: PullRequestSummary) => {
    const entry = channels.byRepo.get(`${pr.repo.owner}/${pr.repo.name}`) ?? EMPTY_CHANNELS;
    return releaseLadder(pr, entry.baselines, entry.compares);
  };

  // Shift work that has not opened a pull request yet, above the open rows.
  const todos = useShiftTodos(undefined);
  const ghosts: GhostGroup[] = useMemo(
    () =>
      board
        ? []
        : pullGhostGroups(todos.data?.todos ?? [], {
            now: new Date(),
            repos: repo === 'all' ? null : new Set([repo]),
            family,
          }),
    [board, family, repo, todos.data]
  );
  if (snapshot.isLoading) {
    return (
      <div className="page pull-room" data-testid="pull-room-page">
        <header className="page__header">
          <h1 className="page__title">Pull requests</h1>
        </header>
        <p className="page__roadmap-note">Loading pull requests.</p>
      </div>
    );
  }

  if (snapshot.isError || !snapshot.data) {
    return (
      <div className="page pull-room" data-testid="pull-room-page">
        <header className="page__header">
          <h1 className="page__title">Pull requests</h1>
        </header>
        <p className="page__roadmap-note">
          {snapshot.error?.message ?? 'Pull requests are unavailable right now.'}
        </p>
      </div>
    );
  }

  return (
    <div className="page page--full pull-room" data-testid="pull-room-page">
      <header className="page__header pull-room__header">
        <div>
          <h1 className="page__title">Pull requests</h1>
          <p className="page__subtitle">
            Open pull requests across every repository.
          </p>
          {board ? null : (
            <p className="pull-room__sentence" data-testid="pull-room-sentence">
              {timelineSentence(rows, awaitingReleaseCount(rows, ladderFor))}
            </p>
          )}
        </div>
        <div className="pull-room__views" role="group" aria-label="View">
          <button type="button" aria-pressed={!board} onClick={() => setBoard(false)}>
            Timeline
          </button>
          <button type="button" aria-pressed={board} onClick={() => setBoard(true)}>
            Board
          </button>
        </div>
      </header>

      <nav className="pull-room__families" aria-label="Family" data-testid="pull-room-families">
        <button
          type="button"
          className="pull-room__family"
          aria-pressed={family === ''}
          onClick={() => setFamily('')}
        >
          All <span className="pull-room__family-count">{pills.reduce((sum, pill) => sum + pill.count, 0)}</span>
        </button>
        {pills.map((pill) => (
          <button
            key={pill.family}
            type="button"
            className="pull-room__family"
            aria-pressed={family === pill.family}
            onClick={() => setFamily(pill.family)}
          >
            {familyLabel(pill.family)}{' '}
            <span className="pull-room__family-count">{pill.count}</span>
          </button>
        ))}
        {family && !pills.some((pill) => pill.family === family) ? (
          <button type="button" className="pull-room__family" aria-pressed="true" onClick={() => setFamily('')}>
            {family} <span className="pull-room__family-count">0</span>
          </button>
        ) : null}
      </nav>

      <details
        className="pull-room__filter-fold"
        open={filtersOpen}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>{filtersActive ? 'Filters (on)' : 'Filters'}</summary>
      <section className="pull-room__filters" aria-label="Pull request filters">
        <label>
          Repo
          <select
            value={filters.repo}
            onChange={(event) => setRepo(event.target.value)}
          >
            <option value="all">All repos</option>
            {repos.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
        </label>
        <label>
          State
          <select
            value={filters.state}
            onChange={(event) =>
              setFilters((current) => ({ ...current, state: event.target.value }))
            }
          >
            <option value="active">Default (timeline adds release history)</option>
            <option value="all">All states</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="mergeable">Mergeable</option>
            <option value="merged">Merged</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          Evidence
          <select
            value={filters.evidence}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                evidence: event.target.value,
              }))
            }
          >
            <option value="all">All evidence</option>
            {EVIDENCE_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label>
          Checks
          <select
            value={filters.checkPosture}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                checkPosture: event.target.value,
              }))
            }
          >
            <option value="all">All checks</option>
            <option value="missing">Missing</option>
            <option value="failing">Failing</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="passing">Passing</option>
          </select>
        </label>
        <label className="pull-room__search">
          Search
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            type="search"
            aria-label="Search pull requests"
          />
        </label>
      </section>
      </details>

      <div className="pull-room__content">
        {board ? (
          <PullRequestListView
            lanes={lanes}
            emptyMessage="No pull requests match the current filters."
          />
        ) : (
          <>
            {lists.failed.map((failure) => (
              <p key={failure.repo} className="pull-room__aside" role="status">
                {failure.repo} did not answer: {failure.message}
              </p>
            ))}
            {wanted.skipped > 0 ? (
              <p className="pull-room__aside">
                Showing the first {wanted.repos.length} repositories; {wanted.skipped} more match.
                Narrow by family or repo to see them.
              </p>
            ) : null}
            {rows.length === 0 && ghosts.length === 0 && lists.loading.length > 0 ? (
              <p className="page__roadmap-note">Loading pull requests.</p>
            ) : rows.length === 0 && ghosts.length === 0 ? (
              <p className="pull-list__empty" data-testid="pull-room-empty">
                {filtersActive ? 'No pull requests match the current filters.' : 'No open pull requests.'}{' '}
                {family ? (
                  <button type="button" className="pull-room__scope-clear" onClick={() => setFamily('')}>
                    Show every family
                  </button>
                ) : null}
              </p>
            ) : (
              <PullRequestTimeline
                pulls={rows}
                emptyMessage="No open pull requests."
                showRepo
                ladderFor={ladderFor}
                ghosts={ghosts}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
