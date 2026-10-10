// repositorySettingsSections.tsx — the Settings sections that read live state.
//
// General restates the repository facts the forge already serves (the list
// endpoint's summary); Access lists the grants the automation endpoint answers
// to an administrator. Neither can be edited here: this forge serves no
// per-repository settings API, so the page says what is true instead of
// staging a change that would go nowhere.

import type { AutomationGrantRow, RepositorySummary } from '../api/types';
import { When } from '../format/When';

import './page.css';

export interface GeneralSectionViewProps {
  repo: RepositorySummary;
  /** Whether this viewer may change the repository at all. */
  canWrite: boolean;
}

export function GeneralSectionView({
  repo,
  canWrite,
}: GeneralSectionViewProps): JSX.Element {
  return (
    <section
      className="page__section"
      aria-labelledby="settings-general"
      data-testid="settings-general"
    >
      <h2 className="page__section-title" id="settings-general">
        General
      </h2>
      <dl className="mirror-section__facts">
        <div>
          <dt>Default branch</dt>
          <dd>{repo.default_branch}</dd>
        </div>
        <div>
          <dt>Family</dt>
          <dd>{repo.family ?? 'none'}</dd>
        </div>
        <div>
          <dt>Visibility</dt>
          <dd>{repo.visibility}</dd>
        </div>
        <div>
          <dt>Archived</dt>
          <dd>{repo.archived ? 'yes — the repository is read-only' : 'no'}</dd>
        </div>
      </dl>
      <p className="text-muted">
        {canWrite
          ? 'This forge changes these through its own API, not from this page.'
          : 'Reading only: changing these needs repo.admin.'}
      </p>
    </section>
  );
}

export interface AccessSectionViewProps {
  grants: readonly AutomationGrantRow[] | undefined;
  /** False when the caller may not read the grants (not an empty list). */
  visible: boolean;
  loading?: boolean;
  failed?: boolean;
}

export function AccessSectionView({
  grants,
  visible,
  loading = false,
  failed = false,
}: AccessSectionViewProps): JSX.Element {
  const rows = grants ?? [];
  return (
    <section
      className="page__section"
      aria-labelledby="settings-access"
      data-testid="settings-access"
    >
      <h2 className="page__section-title" id="settings-access">
        Access
      </h2>
      {loading ? (
        <p className="text-muted">Loading grants…</p>
      ) : failed ? (
        <p className="text-muted">This forge did not answer who holds access.</p>
      ) : !visible ? (
        <p className="text-muted" data-testid="settings-access-hidden">
          Only a repository administrator can see who holds which access.
        </p>
      ) : rows.length === 0 ? (
        <p>Nobody holds a grant on this repository yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Who</th>
              <th scope="col">Access</th>
              <th scope="col">Granted by</th>
              <th scope="col">Granted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((grant) => (
              <tr key={grant.login}>
                <td>{grant.login}</td>
                <td>{grant.access}</td>
                <td>{grant.grantedBy}</td>
                <td>
                  <When at={grant.grantedAt} fallback="never" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
