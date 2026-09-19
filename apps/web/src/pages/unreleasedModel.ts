// unreleasedModel.ts — pure projection behind the Unreleased page.
//
// One row per pull request, classified against the repository's newest
// release. Where a release comes from depends on how the repository ships:
//
// - deployment: the forge recorded a live production deployment (jeryu-deploy
//   style). `compare?base=<live sha>&head=main` lists what production lacks,
//   and `unshippedPulls` from releasesModel picks the merged PRs among it.
// - tag: no deployment, but a tag is reachable from main (split repositories
//   released by tag). A merged PR is released iff its merge commit is an
//   ancestor of that tag, i.e. it is not among `compare?base=<tag>&head=main`.
// - none: neither. Merged PRs are "no release recorded", never "unreleased".
//
// The forge only fast-forwards, so a merged PR's head sha is its merge commit.

import type { PullRequestSummary } from '../../../../contracts/generated/PullRequestSummary';
import type { CompareResponse } from '../api/types/deployments';
import { unshippedPulls } from './releasesModel';
import { fromPullRequestSummary } from './pullRoomModel';

export type UnreleasedStatus =
  | 'about_to_land'
  | 'merged_unreleased'
  | 'open_failing'
  | 'open'
  | 'merged_unrecorded'
  | 'merged_unknown'
  | 'released';

/** Top-to-bottom order of the table; released PRs always sink. */
export const STATUS_ORDER: readonly UnreleasedStatus[] = [
  'about_to_land',
  'merged_unreleased',
  'open_failing',
  'open',
  'merged_unrecorded',
  'merged_unknown',
  'released',
];

export const STATUS_LABELS: Record<UnreleasedStatus, string> = {
  about_to_land: 'Open · passing / approved, about to land',
  merged_unreleased: 'Merged · unreleased',
  open_failing: 'Open · checks failing',
  open: 'Open · checks pending',
  merged_unrecorded: 'Merged · no release recorded',
  merged_unknown: 'Merged · release unknown',
  released: 'Released',
};

export type ReleaseBaseline =
  | {
      kind: 'deployment';
      /** Release name from the deployment payload, else the environment. */
      name: string;
      environment: string;
      sha: string;
      at: string;
    }
  | { kind: 'tag'; name: string; sha: string; at: string | null }
  | { kind: 'none' };

export interface UnreleasedRow {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  status: UnreleasedStatus;
  /** Best-known merge time: the merge commit's date, else the PR's last update. */
  mergedAt: string | null;
  headSha: string;
  /** Set on released rows: the release that carries the PR. */
  release: { name: string; at: string | null } | null;
}

export interface RepoSummary {
  /** 'releasable' when main is ahead, 'current' when not, else unknown/none. */
  state: 'releasable' | 'current' | 'unknown' | 'none';
  text: string;
}

function openStatus(pr: PullRequestSummary): UnreleasedStatus {
  if (pr.checks.failing > 0) return 'open_failing';
  if (pr.draft || pr.checks.pending > 0) return 'open';
  const passing = pr.checks.total > 0 && pr.checks.passing > 0;
  const approved =
    pr.review.required_approvals > 0 && pr.review.approvals >= pr.review.required_approvals;
  return passing || approved ? 'about_to_land' : 'open';
}

/**
 * Classify every open or merged PR of one repository. `compare` is
 * `baseline.sha..main`; null while it loads or when it failed, which leaves
 * merged PRs "release unknown" rather than guessing.
 */
export function classifyPulls(
  pulls: readonly PullRequestSummary[],
  baseline: ReleaseBaseline,
  compare: CompareResponse | null
): UnreleasedRow[] {
  const unreleased =
    baseline.kind === 'none' || !compare
      ? null
      : new Set(
          baseline.kind === 'deployment'
            ? unshippedPulls(compare, pulls).map((pr) => pr.number)
            : pulls
                .filter((pr) => compare.commits.some((c) => c.sha === pr.head_sha))
                .map((pr) => pr.number)
        );
  const committedAt = new Map(compare?.commits.map((c) => [c.sha, c.committed_at]) ?? []);
  const rows: UnreleasedRow[] = [];
  for (const pr of pulls) {
    if (pr.state === 'closed' || !hasPosture(pr)) continue;
    let status: UnreleasedStatus;
    if (pr.state === 'open') {
      status = openStatus(pr);
    } else if (baseline.kind === 'none') {
      status = 'merged_unrecorded';
    } else if (!unreleased || !compare) {
      status = 'merged_unknown';
    } else if (unreleased.has(pr.number)) {
      status = 'merged_unreleased';
    } else {
      // A capped compare cannot prove absence: stay honest about it.
      status = compare.truncated ? 'merged_unknown' : 'released';
    }
    rows.push({
      repo: `${pr.repo.owner}/${pr.repo.name}`,
      number: pr.number,
      title: pr.title,
      url: fromPullRequestSummary(pr).url,
      author: pr.author,
      status,
      mergedAt: pr.state === 'merged' ? committedAt.get(pr.head_sha) ?? pr.updated_at : null,
      headSha: pr.head_sha,
      release:
        status === 'released' && baseline.kind !== 'none'
          ? { name: baseline.name, at: baseline.at }
          : null,
    });
  }
  return sortRows(rows);
}

/** Status order first; within a status, newest merge (or number) first. */
export function sortRows(rows: UnreleasedRow[]): UnreleasedRow[] {
  const rank = (status: UnreleasedStatus) => STATUS_ORDER.indexOf(status);
  return [...rows].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (b.mergedAt ?? '').localeCompare(a.mergedAt ?? '') ||
      b.number - a.number
  );
}

export function visibleRows(rows: readonly UnreleasedRow[], showReleased: boolean): UnreleasedRow[] {
  return showReleased ? [...rows] : rows.filter((row) => row.status !== 'released');
}

/** "main is 3 commits / 2 PRs ahead of rel-b — releasable". */
export function repoSummary(
  baseline: ReleaseBaseline,
  compare: CompareResponse | null,
  rows: readonly UnreleasedRow[],
  branch = 'main'
): RepoSummary {
  if (baseline.kind === 'none') {
    return { state: 'none', text: 'No release recorded — no deployment and no release tag on ' + branch };
  }
  if (!compare) {
    return { state: 'unknown', text: `Comparing ${branch} with ${baseline.name}…` };
  }
  if (compare.ahead_by === 0) {
    return { state: 'current', text: `${branch} matches ${baseline.name} — nothing to release` };
  }
  const commits = `${compare.ahead_by} commit${compare.ahead_by === 1 ? '' : 's'}`;
  const prs = rows.filter((row) => row.status === 'merged_unreleased').length;
  const prPart = compare.truncated ? '' : ` / ${prs} PR${prs === 1 ? '' : 's'}`;
  return {
    state: 'releasable',
    text: `${branch} is ${commits}${prPart} ahead of ${baseline.name} — releasable`,
  };
}

/** `/unreleased?repo=owner/name` or `/unreleased?family=<family>`. */
export function unreleasedHref(scope: { repo: string } | { family: string }): string {
  return 'repo' in scope
    ? `/unreleased?repo=${encodeURIComponent(scope.repo)}`
    : `/unreleased?family=${encodeURIComponent(scope.family)}`;
}

/**
 * A pull request this list can describe. An older or partial payload may omit
 * the repository or the check and review posture; such an item is left out
 * rather than taking the page down.
 */
function hasPosture(pr: PullRequestSummary): boolean {
  const loose: Partial<PullRequestSummary> = pr;
  return Boolean(loose.repo && loose.checks && loose.review);
}

