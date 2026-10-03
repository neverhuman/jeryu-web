import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { EvidenceState, PullRequestSummary } from '../api/types';
import { useFamilyScope } from '../components/family/FamilyScopeProvider';
import { ErrorState, LoadingState } from '../components/state';
import { CONTROL_PLANE_MAX_LIMIT, useControlPlane } from '../hooks/useControlPlane';
import { useRepoChannels, EMPTY_CHANNELS } from '../hooks/useRepoChannels';
import { useRepoPullLists } from '../hooks/useRepoPullLists';
import { useAuth } from '../hooks/useAuth';
import { useAttention } from '../hooks/usePipeline';
import { useForgeHost } from '../hooks/useForgeHost';
import { useRepositories } from '../hooks/useRepositories';
import { useShiftTodos } from '../hooks/useShift';
import { useRepoFamilies } from './needsYou/AttentionRow';
import { filterByFamily, needsYouHref, urgentInArea } from './needsYou/needsYouModel';
import { attentionByPull, attentionOffRows, pullAttentionKey } from './pullAttentionModel';
import { PullRequestListView } from './PullRequestListView';
import { PullRequestTimeline } from './PullRequestTimeline';
import {
  awaitingReleaseByRepo,
  awaitingReleaseCount,
  awaitingReleaseWarning,
} from './pullRepoGroupsModel';
import { RELEASES_PATH, releaseFamilyPath } from './releaseBoard/links';
import { pullGhostGroups, type GhostGroup } from './pullGhostsModel';
import { releaseLadder } from './releaseChannelsModel';
import {
  ACTIVE_STATE_FILTER,
  DEFAULT_PULL_ROOM_FILTERS,
  PULL_ROOM_FILTER_PARAMS,
  familyLabel,
  familyPills,
  filterPullRequests,
  filterPullSummaries,
  fromControlPullRequest,
  groupPullRequests,
  isBoardView,
  pullListState,
  repoOptions,
  scopedCounts,
  summaryCounts,
  timelineRepos,
  truncatedCollections,
  scopeToFamily,
  type PullRoomFilters,
} from './pullRoomModel';
import { pullCountsSentence } from './pullTimelineModel';
import { usePageTitle } from '../hooks/usePageTitle';
import { useViewState } from '../hooks/useViewState';

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
  usePageTitle('In flight');
  // The open work is what this page is for, so it asks for the largest page
  // the snapshot hands out rather than the default 100 rows per collection.
  const snapshot = useControlPlane({
    refetchInterval: REFRESH_MS,
    limit: CONTROL_PLANE_MAX_LIMIT,
  });
  // Every filter is in the URL, so the list a person is looking at is a link
  // and a shared one re-opens the same view.
  const view = useViewState();
  const filters = useMemo<PullRoomFilters>(
    () => ({
      repo: view.read(PULL_ROOM_FILTER_PARAMS.repo, DEFAULT_PULL_ROOM_FILTERS.repo),
      state: view.read(PULL_ROOM_FILTER_PARAMS.state, DEFAULT_PULL_ROOM_FILTERS.state),
      evidence: view.read(
        PULL_ROOM_FILTER_PARAMS.evidence,
        DEFAULT_PULL_ROOM_FILTERS.evidence
      ),
      checkPosture: view.read(
        PULL_ROOM_FILTER_PARAMS.checkPosture,
        DEFAULT_PULL_ROOM_FILTERS.checkPosture
      ),
      search: view.read(PULL_ROOM_FILTER_PARAMS.search, DEFAULT_PULL_ROOM_FILTERS.search),
    }),
    [view]
  );
  const repo = filters.repo;
  // Typing and the filter selects narrow one list: they replace, so Back
  // leaves the page rather than retracing a search box letter by letter.
  const setFilters = (patch: Partial<PullRoomFilters>): void => {
    const written: Record<string, string | null> = {};
    for (const key of Object.keys(patch) as (keyof PullRoomFilters)[]) {
      const value = patch[key] ?? DEFAULT_PULL_ROOM_FILTERS[key];
      written[PULL_ROOM_FILTER_PARAMS[key]] =
        value === DEFAULT_PULL_ROOM_FILTERS[key] ? null : value;
    }
    view.write(written, 'replace');
  };
  const scope = useFamilyScope();
  // Five controls for a handful of pull requests is more to read than the list
  // itself: they fold away unless one of them is doing something.
  const filtersActive =
    filters.repo !== DEFAULT_PULL_ROOM_FILTERS.repo ||
    filters.state !== DEFAULT_PULL_ROOM_FILTERS.state ||
    filters.evidence !== DEFAULT_PULL_ROOM_FILTERS.evidence ||
    filters.checkPosture !== DEFAULT_PULL_ROOM_FILTERS.checkPosture ||
    filters.search !== DEFAULT_PULL_ROOM_FILTERS.search;
  const [filtersOpen, setFiltersOpen] = useState(filtersActive);
  // The shell's family scope scopes everything on the page to that family's
  // repos, and is stated here as `?family=`. The repository list (already
  // cached for /repos) says which family a repo is in.
  const family = scope.family;
  const repositories = useRepositories({});
  const forgeHost = useForgeHost();
  const members = useMemo(
    () => repositories.data?.repositories ?? [],
    [repositories.data]
  );
  const families = useMemo(
    () =>
      new Map(
        members.map((member) => [
          `${member.id.owner}/${member.id.name}`,
          member.family ?? null,
        ])
      ),
    [members]
  );
  // A family pill sets the shell's scope: it replaces the address, so Back
  // leaves the page rather than undoing a pill. The board toggle is a view
  // switch and pushes, so Back returns to the view before it.
  const setFamily = (value: string): void => scope.setFamily(value);
  const setRepo = (value: string): void => setFilters({ repo: value });
  // The timeline is the page; the lane board stays one click away.
  const board = isBoardView(view.read('view'));
  const setBoard = (next: boolean): void =>
    view.write({ view: next ? 'board' : null }, 'push');

  // The board shows work in flight. The timeline is a history — its bands run
  // from work that has not merged yet down to what production runs — so its
  // default asks for merged and closed pull requests too.
  const viewFilters = useMemo(
    () =>
      board || filters.state !== ACTIVE_STATE_FILTER ? filters : { ...filters, state: 'all' },
    [board, filters]
  );

  const everything = useMemo(
    () =>
      snapshot.data?.pullRequests.map((pr) => fromControlPullRequest(pr, forgeHost(pr.repo))) ?? [],
    [snapshot.data, forgeHost]
  );
  // Every family the repository list knows gets a toggle, with the server's
  // own open-pull-request count — including 0, so a quiet family is still a
  // way in. The snapshot's pull request collection is one page of many and
  // cannot be counted for this.
  const pills = useMemo(
    () =>
      familyPills(
        members.map((member) => ({
          family: member.family ?? null,
          openPullRequests: member.open_pull_requests,
        }))
      ),
    [members]
  );
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
  // With a history filter every repository in scope is asked, as its own
  // Pull requests page would be; the snapshot alone only knows open ones.
  const wanted = useMemo(
    () =>
      timelineRepos(
        filterPullRequests(items, viewFilters),
        Array.from(families.keys()),
        {
          repo: filters.repo,
          family,
          history: pullListState(viewFilters.state) === undefined,
        },
        families
      ),
    [items, viewFilters, families, filters.repo, family]
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

  /**
   * A todo names its repos bare (`jeryu-web`); a section is keyed `owner/name`.
   * Two repositories can share a name under different owners, so one that
   * holds a pull request wins over one that merely exists. The repositories
   * asked for their lists cannot break the tie any more: with a history filter
   * that is every repository in scope, which would make the winner whichever
   * sorted last.
   */
  const repoKeyFor = useMemo(() => {
    const byName = new Map<string, string>();
    for (const full of repoOptions(items)) {
      const name = full.split('/')[1];
      if (name && !byName.has(name)) byName.set(name, full);
    }
    for (const member of repositories.data?.repositories ?? []) {
      const full = `${member.id.owner}/${member.id.name}`;
      if (!byName.has(member.id.name)) byName.set(member.id.name, full);
    }
    return (repo: string): string | null =>
      repo.includes('/') ? repo : byName.get(repo) ?? null;
  }, [repositories.data, items]);

  // Shift work that has not opened a pull request yet, filed under its repo.
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
  // What waits on a person here is marked on its own row; only what no row
  // below carries is counted above the list, with the way to Needs you.
  const { user } = useAuth();
  const attention = useAttention(user?.role === 'admin');
  const repoFamilies = useRepoFamilies();
  const waiting = useMemo(
    () => filterByFamily(urgentInArea(attention.data, 'pulls'), family, repoFamilies),
    [attention.data, family, repoFamilies]
  );
  const waitingByPull = useMemo(() => attentionByPull(waiting), [waiting]);
  const waitingOffRows = useMemo(
    () =>
      attentionOffRows(
        waiting,
        new Set(board ? [] : rows.map((pr) => pullAttentionKey(`${pr.repo.owner}/${pr.repo.name}`, pr.number)))
      ),
    [waiting, board, rows]
  );

  if (snapshot.isLoading) {
    return (
      <div className="page pull-room" data-testid="pull-room-page">
        <header className="page__header">
          <h1 className="page__title">In flight</h1>
        </header>
        <LoadingState variant="message" title="Loading pull requests." />
      </div>
    );
  }

  if (snapshot.isError || !snapshot.data) {
    return (
      <div className="page pull-room" data-testid="pull-room-page">
        <header className="page__header">
          <h1 className="page__title">In flight</h1>
        </header>
        <ErrorState
          title="Could not load pull requests."
          error={snapshot.error}
          description={
            snapshot.error ? undefined : 'Pull requests are unavailable right now.'
          }
          onRetry={() => void snapshot.refetch()}
          testId="pull-room-error"
        />
      </div>
    );
  }

  // Unscoped, the counts are the server's: it counted every pull request,
  // while this page holds one page of the snapshot and 24 repositories of
  // lists. Scoped to a family or a repo, the loaded rows are the better
  // answer, and `wanted.skipped` says when even they are cut.
  const scoped = family !== '' || filters.repo !== 'all';
  const headerCounts = scoped
    ? scopedCounts(items)
    : summaryCounts(snapshot.data.summary);
  // Anything the page reads that the snapshot cut short is said out loud.
  const truncated = truncatedCollections(snapshot.data.page, ['pull_requests']);
  // Merged work that reached no release is a warning, not just a count.
  const unshipped = board ? null : awaitingReleaseWarning(awaitingReleaseByRepo(rows, ladderFor));

  return (
    <div className="page page--full pull-room" data-testid="pull-room-page">
      <header className="page__header pull-room__header">
        <div>
          <h1 className="page__title">In flight</h1>
          <p className="page__subtitle">
            Every change between claimed work and release, across every repository.
          </p>
          <p className="pull-room__sentence" data-testid="pull-room-sentence">
            {pullCountsSentence(
              headerCounts,
              board ? undefined : awaitingReleaseCount(rows, ladderFor)
            )}
          </p>
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

      {unshipped ? (
        <p className="pull-room__unshipped" role="status" data-testid="pull-room-unshipped">
          {unshipped}{' '}
          <Link to={family ? releaseFamilyPath(family) : RELEASES_PATH}>
            {family ? `Open the ${family} release board` : 'Open the release boards'}
          </Link>
        </p>
      ) : null}

      {waitingOffRows.length > 0 ? (
        <p className="pull-room__needs-off" data-testid="pull-room-needs-off">
          <span className="page__pill page__pill--danger">{waitingOffRows.length}</span>{' '}
          {board ? 'waiting on you' : 'more waiting on you, not on a row below'} ·{' '}
          <Link to={needsYouHref(family)}>open Needs you</Link>
        </p>
      ) : null}

      <nav className="pull-room__families" aria-label="Family" data-testid="pull-room-families">
        <button
          type="button"
          className="pull-room__family"
          aria-pressed={family === ''}
          onClick={() => setFamily('')}
        >
          All{' '}
          <span className="pull-room__family-count">
            {summaryCounts(snapshot.data.summary).open}
          </span>
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

      {truncated.length > 0 ? (
        <p className="pull-room__aside" role="status" data-testid="pull-room-truncated">
          The snapshot answered with part of its lists: {truncated.join('; ')}. Open work
          is ordered first, so the open ones are all here.
        </p>
      ) : null}

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
              setFilters({ state: event.target.value })
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
              setFilters({ evidence: event.target.value })
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
              setFilters({ checkPosture: event.target.value })
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
              setFilters({ search: event.target.value })
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
              <LoadingState variant="message" title="Loading pull requests." />
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
                repoKeyFor={repoKeyFor}
                attention={waitingByPull}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
