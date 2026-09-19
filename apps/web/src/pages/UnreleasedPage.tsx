// UnreleasedPage.tsx — what is on main (or about to land) but not released.
//
// Releases is environment-centric; this page is pull-request-centric. One row
// per PR, grouped by repository: PRs about to land and merged PRs no release
// carries yet come first, under a per-repo line saying how far main is ahead
// of the newest release. "Show released" adds the PRs a release already
// carries. Scope comes from `?repo=owner/name` or `?family=<family>`.
//
// Above it, "Ready to pin" (ReadyToPin.tsx) says what the scope's deploy repo
// has not pinned yet, so the page reads as a pipeline: merged but not pinned,
// then pinned but not deployed.

import { Link, useSearchParams } from 'react-router-dom';

import { useRepositories } from '../hooks/useRepositories';
import { useRepoUnreleased } from '../hooks/useRepoUnreleased';
import { ReadyToPin } from './ReadyToPin';
import { DEFAULT_RELEASE_REPO } from './ReleasesPage';
import { STATUS_LABELS, visibleRows, type UnreleasedRow, type UnreleasedStatus } from './unreleasedModel';

import './page.css';
import './ReleasesPage.css';
import './UnreleasedPage.css';

const STATUS_PILL: Record<UnreleasedStatus, string> = {
  about_to_land: 'page__pill--success',
  merged_unreleased: 'page__pill--warning',
  open_failing: 'page__pill--danger',
  open: '',
  merged_unrecorded: '',
  merged_unknown: '',
  released: '',
};

interface RepoScope {
  id: string;
  branch: string;
}

export function UnreleasedPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const family = params.get('family');
  const repoParam = family ? null : (params.get('repo') ?? DEFAULT_RELEASE_REPO);
  const showReleased = params.get('released') === '1';
  const members = useRepositories(
    { family: family ?? undefined, sort: 'name' },
    { enabled: family !== null }
  );

  let repos: RepoScope[] = [];
  if (repoParam) {
    repos = [{ id: repoParam, branch: params.get('branch') ?? 'main' }];
  } else if (members.data) {
    repos = members.data.repositories.map((r) => ({
      id: `${r.id.owner}/${r.id.name}`,
      branch: r.default_branch || 'main',
    }));
  }
  const scopeLabel = family ?? repoParam ?? '';

  const toggleReleased = (next: boolean) => {
    const updated = new URLSearchParams(params);
    if (next) updated.set('released', '1');
    else updated.delete('released');
    setParams(updated);
  };

  return (
    <div className="page page--wide" data-testid="unreleased-page">
      <header className="page__header">
        <h1 className="page__title">Unreleased</h1>
        <p className="page__subtitle">
          Pull requests on main, or about to land, that no release carries yet — for{' '}
          <code>{scopeLabel}</code>.
        </p>
        <form
          className="releases__repo"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('scope');
            if (typeof value !== 'string' || value.trim() === '') return;
            const scope = value.trim();
            setParams(scope.includes('/') ? { repo: scope } : { family: scope });
          }}
        >
          <label htmlFor="unreleased-scope">Repository or family</label>
          <input
            id="unreleased-scope"
            name="scope"
            defaultValue={scopeLabel}
            key={scopeLabel}
            spellCheck={false}
            data-testid="unreleased-scope-input"
          />
          <button type="submit">Show</button>
          <label className="unreleased__toggle">
            <input
              type="checkbox"
              checked={showReleased}
              onChange={(event) => toggleReleased(event.currentTarget.checked)}
              data-testid="unreleased-show-released"
            />
            Show released
          </label>
        </form>
      </header>

      <ReadyToPin
        scope={{
          repo: repoParam,
          family,
          familyRepos: family ? repos.map((repo) => repo.id) : [],
        }}
      />

      {family && members.isLoading ? (
        <p className="page__roadmap-note">Loading {family} repositories…</p>
      ) : family && members.error ? (
        <p className="page__roadmap-note" role="alert">
          Could not list the {family} family: {members.error.message}
        </p>
      ) : repos.length === 0 ? (
        <p className="page__roadmap-note" data-testid="unreleased-no-repos">
          No repositories carry the family label “{family}”.
        </p>
      ) : (
        repos.map((repo) => (
          <RepoSection key={repo.id} repo={repo} showReleased={showReleased} />
        ))
      )}
    </div>
  );
}

function RepoSection({ repo, showReleased }: { repo: RepoScope; showReleased: boolean }): JSX.Element {
  const { rows, summary, isLoading, error } = useRepoUnreleased(repo.id, repo.branch);
  const shown = visibleRows(rows, showReleased);
  const headingId = `unreleased-${repo.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  return (
    <section
      className="page__section"
      aria-labelledby={headingId}
      data-testid={`unreleased-repo-${repo.id}`}
    >
      <h2 className="page__section-title" id={headingId}>
        {repo.id}{' '}
        <Link className="releases__url" to={`/releases?repo=${encodeURIComponent(repo.id)}`}>
          environments
        </Link>
      </h2>
      {error ? (
        <p className="page__roadmap-note" role="alert">
          Could not read {repo.id}: {error.message}
        </p>
      ) : isLoading ? (
        <p className="page__roadmap-note">Loading pull requests…</p>
      ) : (
        <>
          {summary ? (
            <p
              className={`unreleased__summary unreleased__summary--${summary.state}`}
              data-testid={`unreleased-summary-${repo.id}`}
            >
              {summary.text}
            </p>
          ) : null}
          {shown.length === 0 ? (
            <p className="releases__muted" data-testid={`unreleased-empty-${repo.id}`}>
              {showReleased ? 'No open or merged pull requests.' : 'Nothing waiting to be released.'}
            </p>
          ) : (
            <div className="releases__table-wrap">
              <table className="releases__table" data-testid={`unreleased-table-${repo.id}`}>
                <thead>
                  <tr>
                    <th scope="col">Pull request</th>
                    <th scope="col">Author</th>
                    <th scope="col">Status</th>
                    <th scope="col">Merged</th>
                    <th scope="col">Head</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <PullRow key={row.number} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PullRow({ row }: { row: UnreleasedRow }): JSX.Element {
  return (
    <tr className="releases__row" data-testid={`unreleased-pr-${row.repo}-${row.number}`}>
      <th scope="row">
        <Link to={row.url}>
          #{row.number} {row.title}
        </Link>
      </th>
      <td>{row.author}</td>
      <td>
        <span className={`page__pill ${STATUS_PILL[row.status]}`} data-status={row.status}>
          {STATUS_LABELS[row.status]}
        </span>
        {row.release ? (
          <span className="releases__muted">
            {' '}
            in {row.release.name}
            {row.release.at ? ` · ${row.release.at.slice(0, 10)}` : ''}
          </span>
        ) : null}
      </td>
      <td>
        {row.mergedAt ? (
          <time dateTime={row.mergedAt} title={row.mergedAt}>
            {row.mergedAt.slice(0, 16).replace('T', ' ')}
          </time>
        ) : (
          <span className="releases__muted">—</span>
        )}
      </td>
      <td>
        <code title={row.headSha}>{row.headSha.slice(0, 7)}</code>
      </td>
    </tr>
  );
}
