// ForgeLinkRedirect.tsx — the forge's public link shape lands on our own pages.
//
// `/<owner>/<repo>` and `/<owner>/<repo>/pull/<number>` are the canonical
// public URLs of a repository this forge hosts: what the API returns as
// `html_url`, and what a person or an agent can retype. The rest of the shapes
// in circulation arrive here too — `/pulls`, `/issues/<n>`,
// `/blob/<ref>/<path>`, `/tree/<ref>/<path>`, `/commit/<sha>`, and a pull
// request's own tab (`/pull/<n>/files`). This app resolves all of them onto
// `/repos/<provider>/<owner>/<repo>[/<tab>/<tail>]`, where the pages live; the
// tab names are the forge's own, so each shape keeps its meaning across the
// hop, and the query string and fragment ride along untouched.
//
// The provider comes from the repository list — the same cached `GET /repos`
// the rest of the app uses — never from the link. Where two providers carry the
// same `owner/name`, the repository this forge hosts is what the short link
// means; if neither of them is ours, the link is ambiguous and this page asks
// which one rather than opening whichever came back first. An owner/repo we do
// not know is a bad address: it renders the 404 page.

import { Navigate, useLocation, useParams, Link } from 'react-router-dom';

import { LoadingState } from '../components/state';
import { useRepositories } from '../hooks/useRepositories';
import { NotFoundPage } from './NotFoundPage';
import { isNativeProvider } from './canonicalLinks';
import { repoFrontPath } from './repoBrowserModel';

export interface ForgeLinkRedirectProps {
  /**
   * The sub-path of the in-app URL: `pulls` for `pull/<n>`, the forge's own
   * name for the rest. Left out, the link names the repository itself and
   * lands on its front page.
   */
  subPath?: 'pulls' | 'issues' | 'blob' | 'tree' | 'commit';
}

/** The pull request tabs a `/pull/<n>/<tab>` link can name. */
const PULL_TABS = ['files', 'checks', 'commits'] as const;

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

  const candidates = (repositories.data?.repositories ?? []).filter(
    (member) => member.id.owner === owner && member.id.name === repo
  );
  if (candidates.length === 0) return <NotFoundPage />;
  // One repository, or the one we host: a short link names this forge's own.
  const match =
    candidates.length === 1
      ? candidates[0]
      : candidates.find((member) => isNativeProvider(member.id.host));
  if (!match) {
    return <AmbiguousForgeLink owner={owner} repo={repo} hosts={candidates.map((m) => m.id.host)} />;
  }

  // One named segment (a number, a sha) is encoded here; a splat already holds
  // encoded segments (`<ref>/<path>`), so it passes through as it arrived.
  const named = params.number ?? params.sha;
  const tabParam = params.tab;
  const tab =
    subPath === 'pulls' && tabParam && (PULL_TABS as readonly string[]).includes(tabParam)
      ? tabParam
      : undefined;
  const encodedNamed = named !== undefined ? encodeURIComponent(named) : undefined;
  const tail =
    encodedNamed !== undefined
      ? [encodedNamed, tab].filter(Boolean).join('/')
      : (params['*'] ?? '');
  const front = repoFrontPath(match.id.host, `${owner}/${repo}`);
  const pathname = subPath ? [front, subPath, tail].filter(Boolean).join('/') : front;

  return <Navigate to={{ pathname, search, hash }} replace />;
}

/**
 * Two providers carry this `owner/name` and neither is ours, so the short link
 * does not say which repository it means. Opening one of them would be a
 * guess; this asks instead, with the provider-qualified link for each.
 */
function AmbiguousForgeLink({
  owner,
  repo,
  hosts,
}: {
  owner: string;
  repo: string;
  hosts: string[];
}): JSX.Element {
  return (
    <div className="page" data-testid="forge-link-ambiguous">
      <h1>Which {`${owner}/${repo}`}?</h1>
      <p>
        {hosts.length} providers carry a repository named {`${owner}/${repo}`}, and this link does
        not say which. Open the one you meant:
      </p>
      <ul>
        {hosts.map((host) => (
          <li key={host}>
            <Link to={repoFrontPath(host, `${owner}/${repo}`)}>
              {host}/{owner}/{repo}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
