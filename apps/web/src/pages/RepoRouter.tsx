// RepoRouter.tsx — dispatches repo sub-pages based on the splat path.
//
// All repo URLs go through `repos/:provider/*`. This component parses the
// splat to extract the owner/name (always the first two segments after
// provider) and the sub-path (agents, pulls, settings, blob).
//
// URL examples:
//   /repos/jeryu/jeryu/jankurai          → overview (owner=jeryu, name=jankurai)
//   /repos/jeryu/jeryu/jankurai/agents   → agents page
//   /repos/jeryu/jeryu/jankurai/agents/run-42 → agents page with run-42
//   /repos/jeryu/jeryu/jankurai/blob/main/src/lib.rs → the same page, file open
//   /repos/jeryu/jeryu/jankurai/tree/main/docs → front page, Files open on docs/
//   /repos/jeryu/jeryu/jankurai/code     → redirects to the front page, Files open
//   /repos/jeryu/jeryu/jankurai/work     → redirects to the front page (tracker retired)

import { Navigate, useLocation, useParams } from 'react-router-dom';

import { RepositoryAgentsPage } from './RepositoryAgentsPage';
import { RepositoryBrowserPage } from './RepositoryBrowserPage';
import { RepositoryPullRequestsPage } from './RepositoryPullRequestsPage';
import { RepositorySettingsPage } from './RepositorySettingsPage';
import { PullRequestPage } from './PullRequestPage';
import {
  OPEN_FILES_STATE,
  parseRefAndPath,
  repoFrontPath,
  revealFolderState,
} from './repoBrowserModel';

/** Parse the splat into { fullName, subPath, subTail }.
 *
 *  The splat after `:provider/` always starts with `owner/name`.
 *  After that, the next segment (if any) is the sub-page identifier.
 *
 *  Examples:
 *    "jeryu/jankurai"           → { fullName: "jeryu/jankurai", subPath: null, subTail: "" }
 *    "jeryu/jankurai/agents"    → { fullName: "jeryu/jankurai", subPath: "agents", subTail: "" }
 *    "jeryu/jankurai/agents/r1" → { fullName: "jeryu/jankurai", subPath: "agents", subTail: "r1" }
 *    "jeryu/jankurai/blob/main/x" → { fullName: "jeryu/jankurai", subPath: "blob", subTail: "main/x" }
 */
export function parseRepoSplat(splat: string): {
  fullName: string;
  subPath: string | null;
  subTail: string;
} {
  const segments = splat.replace(/\/+$/, '').split('/');
  // First two segments are always owner/name.
  if (segments.length < 2) {
    return { fullName: splat, subPath: null, subTail: '' };
  }
  const fullName = `${segments[0]}/${segments[1]}`;
  if (segments.length === 2) {
    return { fullName, subPath: null, subTail: '' };
  }
  const subPath = segments[2];
  const subTail = segments.slice(3).join('/');
  return { fullName, subPath, subTail };
}

export function RepoRouter(): JSX.Element {
  const params = useParams();
  const provider = params.provider ?? 'unknown';
  const splat = params['*'] ?? '';
  const { search } = useLocation();
  const { fullName, subPath, subTail } = parseRepoSplat(splat);
  const front = repoFrontPath(provider, fullName);

  // Dispatch to the correct sub-page based on the sub-path.
  switch (subPath) {
    case 'agents':
      return <RepositoryAgentsPage provider={provider} fullName={fullName} splatTail={subTail} />;
    case 'code':
      // The Files panel of the front page is the code browser.
      return <Navigate to={{ pathname: front, search }} state={OPEN_FILES_STATE} replace />;
    case 'tree': {
      // A link to a folder: the front page at that ref, Files open on the folder.
      const { ref, path } = parseRefAndPath(subTail);
      return (
        <Navigate
          to={{ pathname: front, search: ref ? `?ref=${encodeURIComponent(ref)}` : '' }}
          state={revealFolderState(path)}
          replace
        />
      );
    }
    case 'blob':
      // The same component as the front page, in the same position, so the
      // Files panel keeps its state while the reader moves between files.
      return <RepositoryBrowserPage provider={provider} fullName={fullName} blobSplat={subTail} />;
    case 'pulls': {
      // /pulls or /pulls/:number
      if (subTail) {
        return <PullRequestPage provider={provider} fullName={fullName} prNumber={subTail} />;
      }
      return <RepositoryPullRequestsPage provider={provider} fullName={fullName} />;
    }
    case 'issues':
    case 'work':
      // The per-repo tracker is retired (the shift queue at /work replaced it);
      // old links land on the repository instead of a 404.
      return <Navigate to={front} replace />;
    case 'settings':
      return <RepositorySettingsPage provider={provider} fullName={fullName} section={subTail || undefined} />;
    default:
      // No known sub-path: the repository front page.
      return <RepositoryBrowserPage provider={provider} fullName={fullName} />;
  }
}
