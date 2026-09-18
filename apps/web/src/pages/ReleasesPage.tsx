// ReleasesPage.tsx — what each environment runs, and what it is missing.
//
// One row per environment (production, stable, canary, dev, then any other
// the forge has recorded): the live commit and release, who deployed it and
// when, the rollback target, a failed or running newer attempt, the live URL,
// and how many merged pull requests the default branch has that the
// environment does not. Environments with no recorded deployment render as
// "not configured" rather than disappearing, so the pipeline's shape shows.

import { useSearchParams } from 'react-router-dom';

import { useReleaseOverview } from '../hooks/useReleaseOverview';
import { behindLabel, type DeployedRef, type EnvironmentRow } from './releasesModel';

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
  const repoId = params.get('repo') ?? DEFAULT_RELEASE_REPO;
  const branch = params.get('branch') ?? 'main';
  const { rows, isLoading, error } = useReleaseOverview(repoId, branch);
  const anyDeployed = rows.some((row) => row.configured);

  return (
    <div className="page page--wide" data-testid="releases-page">
      <header className="page__header">
        <h1 className="page__title">Releases</h1>
        <p className="page__subtitle">
          What each environment runs, and which merged pull requests on{' '}
          <code>{branch}</code> it does not have yet.
        </p>
        <form
          className="releases__repo"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('repo');
            if (typeof value === 'string' && value.includes('/')) {
              setParams({ repo: value.trim() });
            }
          }}
        >
          <label htmlFor="releases-repo">Repository</label>
          <input
            id="releases-repo"
            name="repo"
            defaultValue={repoId}
            key={repoId}
            spellCheck={false}
            data-testid="releases-repo-input"
          />
          <button type="submit">Show</button>
        </form>
      </header>

      <section className="page__section" aria-labelledby="releases-environments">
        <h2 className="page__section-title" id="releases-environments">
          Environments
        </h2>
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
                    <EnvironmentRowView key={row.name} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function EnvironmentRowView({ row }: { row: EnvironmentRow }): JSX.Element {
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
                    #{pr.number} {pr.title} <span className="releases__muted">· {pr.author}</span>
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
    <span className={`page__pill ${STATE_PILL[attempt.state] ?? ''}`} title={attempt.release ?? attempt.sha}>
      {attempt.state.replace('_', ' ')} {attempt.shortSha}
    </span>
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
