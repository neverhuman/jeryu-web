// releasesModel.ts — pure projection behind the Releases page.
//
// One row per environment: what it runs, who deployed it and when, the
// rollback target, and how far it trails the default branch. "Behind" comes
// from `compare?base=<deployed sha>&head=<default branch>`. Because the forge
// only allows fast-forward merges, a merged pull request is unshipped exactly
// when its head sha is one of those compare commits. A capped compare cannot
// establish the complete PR count; retain only its exact commit count.

import type { PullRequestSummary } from '../../../../contracts/generated/PullRequestSummary';
import type {
  CompareResponse,
  DeploymentState,
  DeploymentWithStatus,
  EnvironmentSummary,
} from '../api/types/deployments';

/** Conventional environments shown even before they have a deployment. */
export const EXPECTED_ENVIRONMENTS = ['production', 'stable', 'canary', 'dev'] as const;

export interface UnshippedPull {
  number: number;
  title: string;
  author: string;
}

export interface DeployedRef {
  sha: string;
  shortSha: string;
  release: string | null;
  deployedAt: string;
  deployedBy: string;
  state: DeploymentState | 'unknown';
  /** Where the deploy's log lives, when the deploy script recorded one. */
  logUrl: string | null;
}

export interface EnvironmentRow {
  name: string;
  /** False for an expected environment nothing has been deployed to yet. */
  configured: boolean;
  current: DeployedRef | null;
  previous: DeployedRef | null;
  /** The newest attempt when it is not what is live (a failed or running deploy). */
  pendingAttempt: DeployedRef | null;
  url: string | null;
  /** Commits on the default branch that the live deployment lacks; null = unknown. */
  commitsBehind: number | null;
  /** Merged PRs among those commits, newest first; null = unknown. */
  unshipped: UnshippedPull[] | null;
}

export function deployedRef(entry: DeploymentWithStatus | null): DeployedRef | null {
  if (!entry) return null;
  const { deployment, status } = entry;
  const release = deployment.payload?.['release'];
  return {
    sha: deployment.sha,
    shortSha: deployment.sha.slice(0, 7),
    release: typeof release === 'string' ? release : null,
    deployedAt: deployment.created_at,
    deployedBy: deployment.creator.login,
    state: status?.state ?? 'unknown',
    logUrl: safeLogUrl(status?.log_url),
  };
}

/** Only http(s) and same-origin paths are rendered as a link. */
export function safeLogUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** SPA path of a PR in `owner/name`. */
export function releasePullHref(repoId: string, number: number): string {
  return `/repos/jeryu/${repoId}/pulls/${number}`;
}

/** Merged PRs whose head is among `compare.commits`, newest first. */
export function unshippedPulls(
  compare: CompareResponse,
  pulls: readonly PullRequestSummary[]
): UnshippedPull[] {
  const order = new Map(compare.commits.map((c, index) => [c.sha, index]));
  return pulls
    .filter((pr) => pr.state === 'merged' && order.has(pr.head_sha))
    .sort((a, b) => (order.get(b.head_sha) ?? 0) - (order.get(a.head_sha) ?? 0))
    .map((pr) => ({ number: pr.number, title: pr.title, author: pr.author }));
}

export function buildEnvironmentRows(
  environments: readonly EnvironmentSummary[],
  compares: ReadonlyMap<string, CompareResponse>,
  pulls: readonly PullRequestSummary[] | null
): EnvironmentRow[] {
  const byName = new Map(environments.map((env) => [env.name, env]));
  const names = [
    ...EXPECTED_ENVIRONMENTS,
    ...environments
      .map((env) => env.name)
      .filter((name) => !(EXPECTED_ENVIRONMENTS as readonly string[]).includes(name))
      .sort(),
  ];
  return names.map((name) => {
    const env = byName.get(name);
    const current = deployedRef(env?.current ?? null);
    const latest = env?.latest ?? null;
    const pendingAttempt =
      latest && latest.deployment.id !== env?.current?.deployment.id ? deployedRef(latest) : null;
    const compare = current ? compares.get(current.sha) : undefined;
    return {
      name,
      configured: env !== undefined,
      current,
      previous: deployedRef(env?.previous ?? null),
      pendingAttempt,
      url: env?.current?.status?.environment_url ?? null,
      commitsBehind: compare ? compare.ahead_by : null,
      unshipped: compare && !compare.truncated && pulls ? unshippedPulls(compare, pulls) : null,
    };
  });
}

/** "3 PRs behind" / "up to date" / null when it cannot be known yet. */
export function behindLabel(row: EnvironmentRow): string | null {
  if (!row.current || row.commitsBehind === null) return null;
  if (row.commitsBehind === 0) return 'up to date';
  const prs = row.unshipped?.length;
  const commits = `${row.commitsBehind} commit${row.commitsBehind === 1 ? '' : 's'}`;
  return prs === undefined
    ? `${commits} behind`
    : `${prs} PR${prs === 1 ? '' : 's'} (${commits}) behind`;
}

/** `repo:owner/name` or `family:name`: the value of one option in the scope picker. */
export type ReleaseScopeValue = `repo:${string}` | `family:${string}`;

export interface ReleaseScopeOption {
  value: ReleaseScopeValue;
  label: string;
}

/**
 * What the scope picker offers: the deploy repos the forge knows (the pins
 * API lists them), their families, and whatever the URL currently names, so
 * the current scope is always one of the options.
 */
export function releaseScopeOptions(
  current: { repo: string | null; family: string | null },
  known: ReadonlyArray<{ repo: string; family?: string | null }>,
  fallbackRepo: string
): ReleaseScopeOption[] {
  const repos = new Set<string>([fallbackRepo]);
  const families = new Set<string>();
  for (const entry of known) {
    if (entry.repo.includes('/')) repos.add(entry.repo);
    if (entry.family) families.add(entry.family);
  }
  if (current.repo) repos.add(current.repo);
  if (current.family) families.add(current.family);
  const options: ReleaseScopeOption[] = [];
  for (const repo of Array.from(repos).sort()) options.push({ value: `repo:${repo}`, label: repo });
  for (const family of Array.from(families).sort()) {
    options.push({ value: `family:${family}`, label: `${family} family (every repository)` });
  }
  return options;
}

/** The query a scope option stands for, or null for a value the picker never offers. */
export function scopeParams(value: string): { repo: string } | { family: string } | null {
  if (value.startsWith('repo:') && value.slice(5).includes('/')) return { repo: value.slice(5) };
  if (value.startsWith('family:') && value.length > 7) return { family: value.slice(7) };
  return null;
}

/**
 * Environments worth a row: configured ones. "stable / canary / dev: not
 * configured" and an environment with nothing live say nothing a person can
 * act on, so they fold away.
 */
export function splitEnvironments(rows: EnvironmentRow[]): {
  live: EnvironmentRow[];
  other: EnvironmentRow[];
} {
  const live = rows.filter((row) => row.current !== null || row.pendingAttempt !== null);
  const other = rows.filter((row) => !live.includes(row));
  return { live, other };
}

/**
 * Where merged-but-not-released work is read now: the Pull requests timeline,
 * whose bands run from "merged, not yet released" down to what production runs.
 * This page answers the other half — what each environment runs — and links
 * across rather than listing pull requests itself.
 */
export function timelineHref(scope: { repo?: string | null; family?: string | null }): string {
  const query = scope.family
    ? `?family=${encodeURIComponent(scope.family)}`
    : scope.repo
      ? `?repo=${encodeURIComponent(scope.repo)}`
      : '';
  return `/pull-room${query}`;
}

/** The Releases page scoped to one repository: what each environment runs, and what waits. */
export function releasesHref(repo: string): string {
  return `/releases?repo=${encodeURIComponent(repo)}`;
}

