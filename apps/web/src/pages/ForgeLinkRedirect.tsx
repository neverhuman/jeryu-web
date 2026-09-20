// ForgeLinkRedirect.tsx — GitHub-shaped repository links land on our own pages.
//
// Links in circulation (pull request bodies, notifications, agent output,
// bookmarks) use the forge shape `/<owner>/<repo>/pull/<number>` and
// `/<owner>/<repo>/issues/<number>`. Our canonical URLs carry the provider:
// `/repos/<provider>/<owner>/<repo>/pulls/<number>`.
//
// The provider comes from the repository list — the same cached `GET /repos`
// the rest of the app uses — so a repository mirrored from another host lands
// on its own provider instead of an assumed one. An owner/repo we do not know
// is a bad address: it renders the 404 page rather than redirecting nowhere.

import { Navigate, useLocation, useParams } from 'react-router-dom';

import { LoadingState } from '../components/state';
import { useRepositories } from '../hooks/useRepositories';
import { NotFoundPage } from './NotFoundPage';
import { repoFrontPath } from './repoBrowserModel';

export interface ForgeLinkRedirectProps {
  /** The sub-path of the canonical URL: `pulls` for `pull/<n>`. */
  subPath: 'pulls' | 'issues';
}

export function ForgeLinkRedirect({ subPath }: ForgeLinkRedirectProps): JSX.Element {
  const { owner = '', repo = '', number = '' } = useParams();
  const { search, hash } = useLocation();
  const repositories = useRepositories({});

  if (repositories.isPending) {
    return (
      <div className="page">
        <LoadingState variant="message" title="Opening…" />
      </div>
    );
  }

  const match = (repositories.data?.repositories ?? []).find(
    (member) => member.id.owner === owner && member.id.name === repo
  );
  if (!match) return <NotFoundPage />;

  const front = repoFrontPath(match.id.host, `${owner}/${repo}`);
  return (
    <Navigate
      to={{
        pathname: `${front}/${subPath}/${encodeURIComponent(number)}`,
        search,
        hash,
      }}
      replace
    />
  );
}
