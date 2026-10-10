// RepositoryFamilyPage.tsx — the old family address, now a doorway.
//
// A family used to have a browser of its own here: a member rail, a tree and a
// preview, with no pull requests, no tabs and no settings, and a ref and an
// open file that lived in component state so no link could carry them. The
// family is the context of the repository being read, not a second place to
// read it from, so it is a rail inside the one repository shell
// (components/repo/RepoFamilyRail) and this address lands on a member:
//
//   /repos/family/<key>            → the repository the family publishes from
//   /repos/family/<key>?repo=<name> → that member's front page
//
// Old links keep working, which is the whole job of this page; it draws the
// family's loading, empty, denied and failed reads, and nothing else.

import { Boxes } from 'lucide-react';
import { useMemo } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { ActionButton } from '../components/action/ActionButton';
import { formatFamilyName } from '../components/repo';
import { sortFamilyMembers } from '../components/repo/repoFamilyRailModel';
import { PageHeader, queryFreshness } from '../components/pageHeader';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../components/state';
import { useRepositories } from '../hooks/useRepositories';
import { usePageTitle } from '../hooks/usePageTitle';

import { repoUrl } from './repoBrowserModel';

import './page.css';

export function RepositoryFamilyPage(): JSX.Element {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const family = params.family ?? '';
  const wanted = searchParams.get('repo');
  usePageTitle(family || 'Repositories');
  const list = useRepositories({ family, sort: 'name' });

  const repos = useMemo(
    () => sortFamilyMembers(list.data?.repositories ?? []),
    [list.data?.repositories]
  );

  // The named member, else the one the family publishes from: `sortFamilyRepos`
  // puts it first. A `?repo=` naming nothing in the family still opens the
  // family rather than a 404 — the rail is right there to correct the aim.
  const target = (wanted && repos.find((repo) => repo.id.name === wanted)) || repos[0];
  if (target) return <Navigate to={repoUrl(target.id)} replace />;

  let body: JSX.Element;
  if (list.isPending) {
    body = <LoadingState title="Loading family repositories..." rows={6} />;
  } else if (list.error) {
    const err = list.error;
    if (
      err instanceof ApiError &&
      (err.status === 403 || err.code === 'permission_denied')
    ) {
      body = (
        <PermissionDeniedState
          description="You do not have permission to view repositories."
          missingPermission="repo.read"
        />
      );
    } else {
      body = (
        <ErrorState
          title="Could not load family repositories"
          error={err}
          action={
            <ActionButton variant="primary" onClick={() => list.refetch()}>
              Retry
            </ActionButton>
          }
        />
      );
    }
  } else {
    body = (
      <EmptyState
        title="No repositories in this family"
        description={`No repositories carry the family label "${formatFamilyName(family)}".`}
        icon={Boxes}
        action={
          <Link to="/repos">
            <ActionButton variant="primary">Back to repositories</ActionButton>
          </Link>
        }
      />
    );
  }

  return (
    <div className="page" data-testid="repository-family-page">
      <PageHeader
        title={formatFamilyName(family)}
        testId="repository-family-header"
        parent="nav.repos"
        crumbs={[{ label: family }]}
        freshness={queryFreshness(list)}
      />
      {body}
    </div>
  );
}
