// releasesModel.ts — pure projection behind the Releases page.
//
// One row per environment: what it runs, who deployed it and when, the
// rollback target, and how far it trails the default branch. "Behind" comes
// from `compare?base=<deployed sha>&head=<default branch>`. Because the forge
// only allows fast-forward merges, a merged pull request is unshipped exactly
// when its head sha is one of those compare commits, so the count of PRs is
// exact rather than a timestamp guess.

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
  };
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
      unshipped: compare && pulls ? unshippedPulls(compare, pulls) : null,
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
