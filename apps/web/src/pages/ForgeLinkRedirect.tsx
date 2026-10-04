// ForgeLinkRedirect.tsx — GitHub-shaped repository links land on our own pages.
//
// Links in circulation (pull request bodies, notifications, agent output,
// bookmarks) use the forge shape: `/<owner>/<repo>`, `/<owner>/<repo>/pulls`,
// `/<owner>/<repo>/pull/<number>`, `/<owner>/<repo>/issues/<number>`,
// `/<owner>/<repo>/blob/<ref>/<path>`, `/<owner>/<repo>/tree/<ref>/<path>`
// and `/<owner>/<repo>/commit/<sha>`. Our canonical URLs carry the provider:
// `/repos/<provider>/<owner>/<repo>[/<tab>/<tail>]`. The tab names are the
// forge's own, so each shape keeps its meaning across the redirect.
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
  /**
   * The sub-path of the canonical URL: `pulls` for `pull/<n>`, the forge's own
   * name for the rest. Left out, the link names the repository itself and
   * lands on its front page.
   */
  subPath?: 'pulls' | 'issues' | 'blob' | 'tree' | 'commit';
}

export function ForgeLinkRedirect({ subPath }: ForgeLinkRedirectProps): JSX.Element {
  const params = useParams();
  const { owner = '', repo = '' } = params;
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

  // One named segment (a number, a sha) is encoded here; a splat already holds
  // encoded segments (`<ref>/<path>`), so it passes through as it arrived.
  const named = params.number ?? params.sha;
  const tail = named !== undefined ? encodeURIComponent(named) : (params['*'] ?? '');
  const front = repoFrontPath(match.id.host, `${owner}/${repo}`);
  const pathname = subPath ? [front, subPath, tail].filter(Boolean).join('/') : front;

  return <Navigate to={{ pathname, search, hash }} replace />;
}
