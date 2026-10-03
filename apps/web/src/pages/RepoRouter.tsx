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
//   /repos/jeryu/jeryu/jankurai/commits/main?path=src/main.rs → that file's history
//   /repos/jeryu/jeryu/jankurai/commit/<sha> → one commit, message and diff
//   /repos/jeryu/jeryu/jankurai/pulls/42        → one pull request, Conversation
//   /repos/jeryu/jeryu/jankurai/pulls/42/files   → its Files tab
//   /repos/jeryu/jeryu/jankurai/automation → what runs on the repository
//   /repos/jeryu/jeryu/jankurai/activity → the event log, pinned to this repo
//   /repos/jeryu/jeryu/jankurai/code     → redirects to the front page, Files open
//   /repos/jeryu/jeryu/jankurai/work     → redirects to the front page (tracker retired)

import { Navigate, useLocation, useParams } from 'react-router-dom';

import { RepoLayout } from '../components/repo/RepoLayout';

import { RepositoryAgentsPage } from './RepositoryAgentsPage';
import { RepositoryBrowserPage } from './RepositoryBrowserPage';
import { RepositoryCommitPage } from './RepositoryCommitPage';
import { RepositoryCommitsPage } from './RepositoryCommitsPage';
import { RepositoryPullRequestsPage } from './RepositoryPullRequestsPage';
import { RepositoryActivityPage } from './RepositoryActivityPage';
import { RepositoryAutomationPage } from './RepositoryAutomationPage';
import { RepositorySettingsPage } from './RepositorySettingsPage';
import { PullRequestPage } from './PullRequestPage';
import { parsePullTail } from './pullTabsModel';
import { activeRepoTab } from './repoShellModel';
import { usePageTitle } from '../hooks/usePageTitle';
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

/**
 * What a repository page calls itself in the tab: the repository, and the one
 * thing on it the URL names — `acme/widgets#31` for a pull request,
 * `lib.rs · acme/widgets` for a file.
 */
export function repoPageTitle(
  fullName: string,
  subPath: string | null,
  subTail: string
): string {
  switch (subPath) {
    case 'pulls':
      return subTail ? `${fullName}#${subTail}` : `${fullName} · Pull requests`;
    case 'agents':
      return `${fullName} · Agents`;
    case 'settings':
      return `${fullName} · Settings`;
    case 'commits':
      return `${fullName} · Commits`;
    case 'commit':
      return subTail ? `${fullName}@${subTail.slice(0, 7)}` : `${fullName} · Commits`;
    case 'blob': {
      // `subTail` is `<ref>/<path>`; the file's own name is what a tab has room for.
      const { path } = parseRefAndPath(subTail);
      const file = path.split('/').filter(Boolean).pop();
      return file ? `${file} · ${fullName}` : fullName;
    }
    default:
      return fullName;
  }
}

export function RepoRouter(): JSX.Element {
  const params = useParams();
  const provider = params.provider ?? 'unknown';
  const splat = params['*'] ?? '';
  const { search } = useLocation();
  const { fullName, subPath, subTail } = parseRepoSplat(splat);
  const front = repoFrontPath(provider, fullName);
  usePageTitle(repoPageTitle(fullName, subPath, subTail));

  // Every page of a repository is drawn inside the one shell: its header and
  // its tab bar. Only the redirects below skip it — they render nothing.
  const inShell = (page: JSX.Element): JSX.Element => (
    <RepoLayout provider={provider} fullName={fullName} tab={activeRepoTab(subPath)}>
      {page}
    </RepoLayout>
  );

  // Dispatch to the correct sub-page based on the sub-path.
  switch (subPath) {
    case 'agents':
      return inShell(
        <RepositoryAgentsPage provider={provider} fullName={fullName} splatTail={subTail} />
      );
    case 'automation':
      return inShell(<RepositoryAutomationPage provider={provider} fullName={fullName} />);
    case 'activity':
      return inShell(<RepositoryActivityPage fullName={fullName} />);
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
    case 'commits':
      // The ref is optional: without one the list is the default branch's
      // history, and `?path=` narrows it to one file or directory.
      return (
        <RepositoryCommitsPage provider={provider} fullName={fullName} refTail={subTail} />
      );
    case 'commit':
      // One commit: its message and what it changed. Without a sha there is
      // nothing to show, so the list of commits is the destination.
      if (!subTail) {
        return <Navigate to={`${front}/commits`} replace />;
      }
      return <RepositoryCommitPage provider={provider} fullName={fullName} sha={subTail} />;
    case 'blob':
      // The same component as the front page, in the same position, so the
      // Files panel keeps its state while the reader moves between files.
      return inShell(
        <RepositoryBrowserPage provider={provider} fullName={fullName} blobSplat={subTail} />
      );
    case 'pulls': {
      // /pulls, /pulls/:number, or one of that pull request's own tabs
      // (/files, /checks, /commits).
      if (subTail) {
        const { prNumber, tab } = parsePullTail(subTail);
        if (prNumber) {
          // One pull request is its own cockpit, not a tab of the repository.
          return (
            <PullRequestPage
              provider={provider}
              fullName={fullName}
              prNumber={prNumber}
              tab={tab}
            />
          );
        }
      }
      return inShell(<RepositoryPullRequestsPage provider={provider} fullName={fullName} />);
    }
    case 'issues':
    case 'work':
      // The per-repo tracker is retired (the shift queue at /work replaced it);
      // old links land on the repository instead of a 404.
      return <Navigate to={front} replace />;
    case 'settings':
      return inShell(
        <RepositorySettingsPage
          provider={provider}
          fullName={fullName}
          section={subTail || undefined}
        />
      );
    default:
      // No known sub-path: the repository front page.
      return inShell(<RepositoryBrowserPage provider={provider} fullName={fullName} />);
  }
}
