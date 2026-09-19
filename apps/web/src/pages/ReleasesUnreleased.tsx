// ReleasesUnreleased.tsx — the "Merged, not yet released" part of Releases.
//
// One row per pull request, grouped by repository: PRs about to land and
// merged PRs no release carries yet come first, under a per-repo line saying
// how far main is ahead of the newest release. "Show released" adds the PRs a
// release already carries. It used to be a page of its own (/unreleased); it is
// the same question as "what does production run", so it lives on Releases.

import { Link } from 'react-router-dom';

import { useRepoUnreleased } from '../hooks/useRepoUnreleased';
import { STATUS_LABELS, visibleRows, type UnreleasedRow, type UnreleasedStatus } from './unreleasedModel';

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

export interface RepoScope {
  id: string;
  branch: string;
}

export interface UnreleasedSectionProps {
  repos: RepoScope[];
  family: string | null;
  familyState: { isLoading: boolean; error: Error | null };
  showReleased: boolean;
  onToggleReleased: (next: boolean) => void;
  /** Family scope links each repository to its own environments. */
  linkRepos: boolean;
}

export function UnreleasedSection({
  repos,
  family,
  familyState,
  showReleased,
  onToggleReleased,
  linkRepos,
}: UnreleasedSectionProps): JSX.Element {
  return (
    <section
      className="page__section"
      id="unreleased"
      aria-labelledby="unreleased-title"
      data-testid="unreleased-page"
    >
      <h2 className="page__section-title" id="unreleased-title">
        Merged, not yet released
      </h2>
      <p className="releases__muted">
        Pull requests on main, or about to land, that no release carries yet.
      </p>
      <p className="unreleased__toggle">
        <input
          id="unreleased-show-released"
          type="checkbox"
          checked={showReleased}
          onChange={(event) => onToggleReleased(event.currentTarget.checked)}
          data-testid="unreleased-show-released"
        />
        <label htmlFor="unreleased-show-released">Also show released pull requests</label>
      </p>
      {family && familyState.isLoading ? (
        <p className="page__roadmap-note">Loading {family} repositories…</p>
      ) : family && familyState.error ? (
        <p className="page__roadmap-note" role="alert">
          Could not list the {family} family: {familyState.error.message}
        </p>
      ) : repos.length === 0 ? (
        <p className="page__roadmap-note" data-testid="unreleased-no-repos">
          No repositories carry the family label “{family}”.
        </p>
      ) : (
        repos.map((repo) => (
          <RepoSection key={repo.id} repo={repo} showReleased={showReleased} linkRepo={linkRepos} />
        ))
      )}
    </section>
  );
}

function RepoSection({
  repo,
  showReleased,
  linkRepo,
}: {
  repo: RepoScope;
  showReleased: boolean;
  linkRepo: boolean;
}): JSX.Element {
  const { rows, summary, isLoading, error } = useRepoUnreleased(repo.id, repo.branch);
  const shown = visibleRows(rows, showReleased);
  const headingId = `unreleased-${repo.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  return (
    <div
      className="unreleased__repo"
      role="group"
      aria-labelledby={headingId}
      data-testid={`unreleased-repo-${repo.id}`}
    >
      <h3 className="pins__consumer-title" id={headingId}>
        {repo.id}
        {linkRepo ? (
          <>
            {' '}
            <Link className="releases__url" to={`/releases?repo=${encodeURIComponent(repo.id)}`}>
              environments
            </Link>
          </>
        ) : null}
      </h3>
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
    </div>
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
