// ReleasesPage.tsx — one page for "what is released, and what could be".
//
//   1. What runs: one row per CONFIGURED environment (the live commit and
//      release, who deployed it and when, the rollback target, a failed or
//      running newer attempt, and how many merged pull requests main has that
//      the environment does not). Environments with nothing recorded fold
//      behind "other environments".
//   2. Ready to pin: merged in a dependency, not yet in the deploy repo's pin.
//
// This page is about ENVIRONMENTS: what each one runs and what is holding the
// next release. How far an individual change has got — opened, checked,
// reviewed, merged, and out to dev, canary, stable and production — is the Pull
// requests timeline's job, and the two link to each other rather than each
// keeping half a list of pull requests.
//
// Scope comes from `?repo=owner/name` (default the jeryu deploy repo) or
// `?family=<family>`. `/unreleased` was a page, then a section here; it is
// neither now, and the route redirects (see UnreleasedRedirect) because the
// forge's own attention items still link to it.

import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { CopyCommand } from '../components/shellCommand/CopyCommand';
import { useAuth } from '../hooks/useAuth';
import { useAttention, usePins } from '../hooks/usePipeline';

import { useReleaseOverview } from '../hooks/useReleaseOverview';
import { useRepositories } from '../hooks/useRepositories';
import { findAttention } from './needsYou/needsYouModel';
import { behindPinLines } from './pinsModel';
import { ReadyToPin } from './ReadyToPin';
import {
  behindLabel,
  releasePullHref,
  releaseScopeOptions,
  scopeParams,
  splitEnvironments,
  timelineHref,
  type DeployedRef,
  type EnvironmentRow,
} from './releasesModel';

import './page.css';
import './ReleasesPage.css';

export const DEFAULT_RELEASE_REPO = 'jeryu/jeryu-deploy';

const STATE_PILL: Record<string, string> = {
  success: 'page__pill--success',
  inactive: '',
  failure: 'page__pill--danger',
  error: 'page__pill--danger',
  in_progress: 'page__pill--warning',
  queued: 'page__pill--warning',
  pending: 'page__pill--warning',
};

export function ReleasesPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const family = params.get('family');
  const repoId = family ? null : (params.get('repo') ?? DEFAULT_RELEASE_REPO);
  const branch = params.get('branch') ?? 'main';

  const members = useRepositories(
    { family: family ?? undefined, sort: 'name' },
    { enabled: family !== null }
  );
  let repos: { id: string; branch: string }[] = [];
  if (repoId) {
    repos = [{ id: repoId, branch }];
  } else if (members.data) {
    repos = members.data.repositories.map((r) => ({
      id: `${r.id.owner}/${r.id.name}`,
      branch: r.default_branch || 'main',
    }));
  }

  // The deploy repos and families the forge knows feed the scope select.
  const pins = usePins(user?.role === 'admin');
  const options = releaseScopeOptions(
    { repo: repoId, family },
    pins.data?.consumers ?? [],
    DEFAULT_RELEASE_REPO
  );
  const scopeValue = family ? `family:${family}` : `repo:${repoId ?? DEFAULT_RELEASE_REPO}`;

  const setScope = (value: string): void => {
    const next = scopeParams(value);
    if (!next) return;
    setParams(next);
  };

  return (
    <div className="page page--wide" data-testid="releases-page">
      <header className="page__header">
        <h1 className="page__title">Releases</h1>
        <p className="page__subtitle">
          What every environment runs, and what is holding the next release.
        </p>
        <p className="releases__muted">
          For how far one change has got on its way here, see the{' '}
          <Link to={timelineHref({ repo: repoId, family })}>Pull requests timeline</Link>.
        </p>
        <p className="releases__repo">
          <label htmlFor="releases-scope">Repository or family</label>
          <select
            id="releases-scope"
            value={scopeValue}
            onChange={(event) => setScope(event.currentTarget.value)}
            data-testid="releases-scope"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </p>
      </header>

      <StagedRelease />

      {repoId ? <Environments repoId={repoId} branch={branch} /> : null}

      <ReadyToPin
        scope={{
          repo: repoId,
          family,
          familyRepos: family ? repos.map((repo) => repo.id) : [],
        }}
      />
    </div>
  );
}

/**
 * `/unreleased[?…]` was a page of its own, then a section here, and is now the
 * Pull requests timeline. The forge's attention items still emit the old path,
 * so it keeps working and lands on this page's environments and pins.
 */
export function UnreleasedRedirect(): JSX.Element {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/releases', search }} replace />;
}

function Environments({ repoId, branch }: { repoId: string; branch: string }): JSX.Element {
  const { rows, isLoading, error } = useReleaseOverview(repoId, branch);
  const anyDeployed = rows.some((row) => row.configured);
  const { live, other } = splitEnvironments(rows);
  return (
    <section className="page__section" aria-labelledby="releases-environments">
      <h2 className="page__section-title" id="releases-environments">
        What runs
      </h2>
      <UnpinnedLine repoId={repoId} />
      {error ? (
        <p className="page__roadmap-note" role="alert" data-testid="releases-error">
          Deployment history is unavailable for {repoId}: {error.message}
        </p>
      ) : isLoading ? (
        <p className="page__roadmap-note">Loading environments…</p>
      ) : (
        <>
          {!anyDeployed ? (
            <p className="page__roadmap-note" data-testid="releases-empty">
              No deployment of {repoId} has been recorded yet. Deploys record themselves
              here from the next release onward.
            </p>
          ) : null}
          {live.length > 0 ? <EnvironmentTable rows={live} repoId={repoId} branch={branch} /> : null}
          {other.length > 0 ? (
            <details className="releases__other" data-testid="releases-other-environments">
              <summary>
                {other.length} other environment{other.length === 1 ? '' : 's'} with nothing
                live ({other.map((row) => row.name).join(', ')})
              </summary>
              <EnvironmentTable rows={other} repoId={repoId} branch={branch} />
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function EnvironmentTable({
  rows,
  repoId,
  branch,
}: {
  rows: EnvironmentRow[];
  repoId: string;
  branch: string;
}): JSX.Element {
  return (
    <div className="releases__table-wrap">
      <table className="releases__table" data-testid="releases-table">
        <thead>
          <tr>
            <th scope="col">Environment</th>
            <th scope="col">Running</th>
            <th scope="col">Deployed</th>
            <th scope="col">Behind {branch}</th>
            <th scope="col">Rollback target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <EnvironmentRowView key={row.name} row={row} repoId={repoId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvironmentRowView({ row, repoId }: { row: EnvironmentRow; repoId: string }): JSX.Element {
  if (!row.current) {
    return (
      <tr className="releases__row releases__row--empty" data-testid={`releases-env-${row.name}`}>
        <th scope="row">{row.name}</th>
        <td colSpan={4}>
          {row.configured ? (
            <span>
              nothing live yet
              {row.pendingAttempt ? <> · <Attempt attempt={row.pendingAttempt} /></> : null}
            </span>
          ) : (
            <span className="releases__muted">not configured</span>
          )}
        </td>
      </tr>
    );
  }
  const behind = behindLabel(row);
  return (
    <tr className="releases__row" data-testid={`releases-env-${row.name}`}>
      <th scope="row">
        {row.name}
        {row.url ? (
          <a className="releases__url" href={row.url} rel="noreferrer">
            open
          </a>
        ) : null}
      </th>
      <td>
        <Ref ref_={row.current} />
        {row.pendingAttempt ? (
          <div>
            <Attempt attempt={row.pendingAttempt} />
          </div>
        ) : null}
      </td>
      <td>
        <time dateTime={row.current.deployedAt} title={row.current.deployedAt}>
          {relative(row.current.deployedAt)}
        </time>{' '}
        by {row.current.deployedBy}
      </td>
      <td data-testid={`releases-behind-${row.name}`}>
        {behind === null ? (
          <span className="releases__muted">unknown</span>
        ) : (
          <details>
            <summary className={row.commitsBehind ? 'releases__behind' : undefined}>{behind}</summary>
            {row.unshipped && row.unshipped.length > 0 ? (
              <ul className="releases__prs">
                {row.unshipped.map((pr) => (
                  <li key={pr.number}>
                    <Link to={releasePullHref(repoId, pr.number)}>
                      #{pr.number} {pr.title}
                    </Link>{' '}
                    <span className="releases__muted">· {pr.author}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        )}
      </td>
      <td>{row.previous ? <Ref ref_={row.previous} /> : <span className="releases__muted">none</span>}</td>
    </tr>
  );
}

function Ref({ ref_ }: { ref_: DeployedRef }): JSX.Element {
  return (
    <span className="releases__ref">
      <code title={ref_.sha}>{ref_.shortSha}</code>
      {ref_.release ? <span className="releases__release">{ref_.release}</span> : null}
    </span>
  );
}

function Attempt({ attempt }: { attempt: DeployedRef }): JSX.Element {
  return (
    <>
      <span className={`page__pill ${STATE_PILL[attempt.state] ?? ''}`} title={attempt.release ?? attempt.sha}>
        {attempt.state.replace('_', ' ')} {attempt.shortSha}
      </span>
      {attempt.logUrl ? (
        <>
          {' '}
          <a href={attempt.logUrl} target="_blank" rel="noreferrer">
            deploy log
          </a>
        </>
      ) : null}
    </>
  );
}

/**
 * "A release is staged and waiting for the deploy command": the same
 * `release_staged` item Needs you shows, here where the deploy is decided.
 * Attention is admin-only, so other roles never ask.
 */
function StagedRelease(): JSX.Element | null {
  const { user } = useAuth();
  const attention = useAttention(user?.role === 'admin');
  const staged = findAttention(attention.data, 'release_staged');
  if (!staged) return null;
  return (
    <section className="releases__staged" role="status" aria-label="Staged release" data-testid="releases-staged">
      <p className="releases__staged-title">
        <span className="page__pill page__pill--danger">Staged, awaiting deploy</span> {staged.title}
      </p>
      {staged.reason ? <p className="releases__muted">{staged.reason}</p> : null}
      {staged.action?.command ? (
        <CopyCommand command={staged.action.command} label="deploy command" />
      ) : null}
    </section>
  );
}

function relative(iso: string): string {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return iso;
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * What this repo's release cannot carry yet: a dependency merged work that the
 * pin does not reach. One line, linking to where the commits are listed.
 */
function UnpinnedLine({ repoId }: { repoId: string }): JSX.Element | null {
  const { user } = useAuth();
  const pins = usePins(user?.role === 'admin');
  const lines = behindPinLines(pins.data?.consumers ?? [], repoId);
  if (lines.length === 0) return null;
  return (
    <p className="releases__muted" role="status" data-testid="releases-unpinned">
      {lines.join('; ')}.{' '}
      <Link to={timelineHref({ repo: repoId })}>See what a bump would ship</Link>
    </p>
  );
}
