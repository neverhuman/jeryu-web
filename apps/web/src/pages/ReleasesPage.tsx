// ReleasesPage.tsx — one page for "what is released, and what could be".
//
// The default view is the family release board (see releaseBoard/): every
// deliverable of a family as a lane of stages, what each stage runs on each of
// its targets, and how much of the family's work has reached customers. The
// per-repository view is reached with `?repo=owner/name`, from the "Per
// repository" link, or shown under the note when the board cannot be:
//
//   1. What runs: one row per CONFIGURED environment (the live commit and
//      release, who deployed it and when, the rollback target, a failed or
//      running newer attempt, and how many merged pull requests main has that
//      the environment does not). A configured environment with nothing live
//      folds behind "other environments"; one never deployed to is named in a
//      line and given no row.
//   2. Ready to pin: merged in a dependency, not yet in the deploy repo's pin.
//
// This page is about ENVIRONMENTS: what each one runs and what is holding the
// next release. How far an individual change has got — opened, checked,
// reviewed, merged, and out to dev, canary, stable and production — is the Pull
// requests timeline's job, and the two link to each other rather than each
// keeping half a list of pull requests.
//
// Its scope comes from `?repo=owner/name` (default the jeryu deploy repo) or
// `?view=repositories&family=<family>`; on the board, `?family=` picks the
// board instead. `/unreleased` was a page, then a section here; it is
// neither now, and the route redirects (see UnreleasedRedirect) because the
// forge's own attention items still link to it.

import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { CopyCommand } from '../components/shellCommand/CopyCommand';
import { useAuth } from '../hooks/useAuth';
import { useAttention, usePins } from '../hooks/usePipeline';

import { useReleaseOverview } from '../hooks/useReleaseOverview';
import { useRepositories } from '../hooks/useRepositories';
import { commandPlace, findAttention } from './needsYou/needsYouModel';
import { behindPinLines } from './pinsModel';
import { ReadyToPin } from './ReadyToPin';
import { ReleaseBoardView } from './releaseBoard/ReleaseBoardView';
import {
  attemptLabel,
  behindLabel,
  releasePullHref,
  releasesHref,
  releaseScopeOptions,
  scopeParams,
  splitEnvironments,
  timelineHref,
  workHref,
  type DeployedRef,
  type EnvironmentRow,
} from './releasesModel';

import { NeedsYouHere } from './needsYou/NeedsYouHere';

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
  const [params] = useSearchParams();
  const perRepository = params.has('repo') || params.get('view') === REPOSITORY_VIEW;
  const repositoryView = (
    <RepositoryReleases scope={perRepository ? scopeFrom(params) : DEFAULT_SCOPE} />
  );

  return (
    <div className="page page--wide" data-testid="releases-page">
      <header className="page__header">
        <h1 className="page__title">Releases</h1>
        <p className="page__subtitle">
          {perRepository
            ? 'What every environment runs, and what is holding the next release.'
            : 'What each family ships, stage by stage, and how much of its work has reached customers.'}
        </p>
        <nav className="releases__views" aria-label="Releases view">
          <Link
            className="releases__view"
            to="/releases"
            aria-current={perRepository ? undefined : 'page'}
            data-testid="releases-view-board"
          >
            Family board
          </Link>
          <Link
            className="releases__view"
            to={releasesHref(DEFAULT_RELEASE_REPO)}
            aria-current={perRepository ? 'page' : undefined}
            data-testid="releases-view-repository"
          >
            Per repository
          </Link>
        </nav>
      </header>

      <NeedsYouHere area="releases" family={params.get('family') ?? ''} />

      {perRepository ? repositoryView : <ReleaseBoardView fallback={repositoryView} />}
    </div>
  );
}

/** `?view=repositories` keeps the per-repository view when it is scoped to a family. */
const REPOSITORY_VIEW = 'repositories';

interface RepositoryScope {
  repo: string | null;
  family: string | null;
  branch: string;
}

const DEFAULT_SCOPE: RepositoryScope = { repo: DEFAULT_RELEASE_REPO, family: null, branch: 'main' };

/**
 * The per-repository view's scope. On the board `?family=` picks the board;
 * here it scopes to every repository of the family, which only
 * `?view=repositories&family=<name>` asks for.
 */
function scopeFrom(params: URLSearchParams): RepositoryScope {
  const family = params.get('view') === REPOSITORY_VIEW ? params.get('family') : null;
  return {
    family,
    repo: family ? null : (params.get('repo') ?? DEFAULT_RELEASE_REPO),
    branch: params.get('branch') ?? 'main',
  };
}

/**
 * The per-repository view: what each environment of one repository runs, the
 * staged release, and what its dependencies merged that its pins lack.
 */
function RepositoryReleases({ scope }: { scope: RepositoryScope }): JSX.Element {
  const [, setParams] = useSearchParams();
  const { user } = useAuth();
  const { family, repo: repoId, branch } = scope;

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
    setParams('family' in next ? { view: REPOSITORY_VIEW, family: next.family } : next);
  };

  return (
    <>
      <section className="page__section" aria-labelledby="releases-repository">
        <h2 className="page__section-title" id="releases-repository">
          Per repository
        </h2>
        <p className="releases__muted">
          For how far one change has got on its way here, see the{' '}
          <Link to={timelineHref({ repo: repoId, family })}>Pull requests timeline</Link>; for
          work not yet on a pull request, see <Link to={workHref({ repo: repoId, family })}>Work</Link>.
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
      </section>

      <StagedRelease />

      {repoId ? <Environments repoId={repoId} branch={branch} /> : null}

      <ReadyToPin
        scope={{
          repo: repoId,
          family,
          familyRepos: family ? repos.map((repo) => repo.id) : [],
        }}
      />
    </>
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
  const { live, quiet, undeployed } = splitEnvironments(rows);
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
          {quiet.length > 0 ? (
            <details className="releases__other" data-testid="releases-other-environments">
              <summary>
                {quiet.length} other environment{quiet.length === 1 ? '' : 's'} with nothing
                live ({quiet.map((row) => row.name).join(', ')})
              </summary>
              <EnvironmentTable rows={quiet} repoId={repoId} branch={branch} />
            </details>
          ) : null}
          {undeployed.length > 0 ? (
            // Never deployed to: a row of empty cells would only repeat the
            // names, so the names are all this says.
            <p className="releases__muted" data-testid="releases-undeployed-environments">
              Never deployed to: {undeployed.map((row) => row.name).join(', ')}.
            </p>
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
    // Configured, nothing live: the environments never deployed to are named
    // in a line instead (see splitEnvironments), so they reach no table.
    return (
      <tr className="releases__row releases__row--empty" data-testid={`releases-env-${row.name}`}>
        <th scope="row">{row.name}</th>
        <td colSpan={4}>
          <span>
            nothing live yet
            {row.pendingAttempt ? <> · <Attempt attempt={row.pendingAttempt} /></> : null}
          </span>
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
  const label = attemptLabel(attempt);
  return (
    <>
      <span className={`page__pill ${STATE_PILL[attempt.state] ?? ''}`} title={attempt.release ?? attempt.sha}>
        {label.words}
        {label.shortSha ? ` ${label.shortSha}` : ''}
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
        <CopyCommand
          command={staged.action.command}
          where={commandPlace(staged)}
          label="deploy command"
        />
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
