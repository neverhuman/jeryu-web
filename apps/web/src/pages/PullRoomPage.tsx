import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { EvidenceState } from '../api/types';
import { useControlPlane } from '../hooks/useControlPlane';
import { useRepositories } from '../hooks/useRepositories';
import { PullRequestListView } from './PullRequestListView';
import {
  DEFAULT_PULL_ROOM_FILTERS,
  filterPullRequests,
  fromControlPullRequest,
  groupPullRequests,
  pullRoomCounts,
  repoOptions,
  scopeToRepos,
  type PullRoomFilters,
} from './pullRoomModel';

import './page.css';
import './PullRoomPage.css';

const EVIDENCE_STATES: EvidenceState[] = [
  'fresh',
  'missing',
  'queued',
  'failed',
  'unknown',
];

export function PullRoomPage(): JSX.Element {
  // Checks, reviews and merges move without this tab doing anything: poll.
  const snapshot = useControlPlane({ refetchInterval: 30_000 });
  const [searchParams, setSearchParams] = useSearchParams();
  const [localFilters, setFilters] = useState<PullRoomFilters>(DEFAULT_PULL_ROOM_FILTERS);
  // Keep the repository in the URL so shared links and history update the results.
  const repo = searchParams.get('repo') || DEFAULT_PULL_ROOM_FILTERS.repo;
  const filters = useMemo(() => ({ ...localFilters, repo }), [localFilters, repo]);
  // `?family=` scopes everything on the page to that family's repos.
  const family = searchParams.get('family') ?? '';
  const familyRepos = useRepositories({ family }, { enabled: family !== '' });
  const familyRepoSet = useMemo(
    () =>
      family
        ? new Set(
            (familyRepos.data?.repositories ?? []).map(
              (member) => `${member.id.owner}/${member.id.name}`
            )
          )
        : null,
    [family, familyRepos.data]
  );
  const clearFamily = (): void => {
    const params = new URLSearchParams(searchParams);
    params.delete('family');
    setSearchParams(params, { replace: true });
  };
  const setRepo = (value: string): void => {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('repo');
    else params.set('repo', value);
    setSearchParams(params, { replace: true });
  };

  const items = useMemo(
    () =>
      scopeToRepos(
        snapshot.data?.pullRequests.map(fromControlPullRequest) ?? [],
        familyRepoSet
      ),
    [snapshot.data, familyRepoSet]
  );
  const filtered = useMemo(
    () => filterPullRequests(items, filters),
    [filters, items]
  );
  const lanes = useMemo(() => groupPullRequests(filtered), [filtered]);
  const repos = useMemo(() => repoOptions(items), [items]);
  const counts = useMemo(() => pullRoomCounts(items), [items]);
  if (snapshot.isLoading) {
    return (
      <div className="page pull-room" data-testid="pull-room-page">
        <header className="page__header">
          <h1 className="page__title">Pull Room</h1>
        </header>
        <p className="page__roadmap-note">Loading pull requests.</p>
      </div>
    );
  }

  if (snapshot.isError || !snapshot.data) {
    return (
      <div className="page pull-room" data-testid="pull-room-page">
        <header className="page__header">
          <h1 className="page__title">Pull Room</h1>
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
          <h1 className="page__title">Pull Room</h1>
          <p className="page__subtitle">
            Open pull requests across every repository.
          </p>
          {family ? (
            <p className="pull-room__scope" data-testid="pull-room-family-scope">
              Family{' '}
              <Link to={`/repos/family/${encodeURIComponent(family)}`}>{family}</Link>
              {familyRepos.isLoading ? ' · loading members' : null}
              {familyRepos.isError ? ' · members unavailable' : null}{' '}
              <button type="button" className="pull-room__scope-clear" onClick={clearFamily}>
                Show all repos
              </button>
            </p>
          ) : null}
        </div>
        <div className="pull-room__summary">
          <Metric label="open" value={counts.open} />
          <Metric label="missing checks" value={counts.missingChecks} />
          <Metric label="failing checks" value={counts.failingChecks} />
        </div>
      </header>

      <section className="pull-room__filters" aria-label="Pull Room filters">
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
            <option value="active">Active (not merged/closed)</option>
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

      <div className="pull-room__content">
        <PullRequestListView
          lanes={lanes}
          emptyMessage="No pull requests match the current filters."
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="pull-room__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
