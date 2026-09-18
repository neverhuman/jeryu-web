import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../../../../contracts/generated/PullRequestSummary';
import type {
  CompareResponse,
  DeploymentState,
  DeploymentWithStatus,
  EnvironmentSummary,
} from '../../api/types/deployments';
import {
  behindLabel,
  buildEnvironmentRows,
  EXPECTED_ENVIRONMENTS,
  unshippedPulls,
} from '../releasesModel';

const sha = (c: string) => c.repeat(40);

function deployed(
  id: number,
  commit: string,
  state: DeploymentState,
  release = `rel-${commit}`
): DeploymentWithStatus {
  return {
    deployment: {
      id,
      sha: sha(commit),
      ref: 'main',
      task: 'deploy',
      environment: 'production',
      description: null,
      payload: { release },
      creator: { login: 'alton2' },
      created_at: `2026-09-18T0${id}:00:00Z`,
      production_environment: true,
      transient_environment: false,
    },
    status: {
      id: id * 10,
      state,
      description: null,
      environment_url: 'https://git.neverhuman.org',
      log_url: null,
      creator: { login: 'alton2' },
      created_at: `2026-09-18T0${id}:01:00Z`,
    },
    succeeded: state === 'success' || state === 'inactive',
  };
}

function compare(base: string, commits: string[]): CompareResponse {
  return {
    base: sha(base),
    head: 'main',
    base_sha: sha(base),
    head_sha: sha(commits.at(-1) ?? base),
    ahead_by: commits.length,
    behind_by: 0,
    commits: commits.map((c) => ({
      sha: sha(c),
      summary: `commit ${c}`,
      author: 'dev',
      committed_at: '2026-09-18T05:00:00Z',
    })),
    truncated: false,
  };
}

function pull(number: number, head: string, state: 'merged' | 'open' | 'closed'): PullRequestSummary {
  return { number, title: `PR ${number}`, author: 'dev', head_sha: sha(head), state } as PullRequestSummary;
}

const production: EnvironmentSummary = {
  name: 'production',
  latest: deployed(3, 'c', 'failure'),
  current: deployed(2, 'b', 'success'),
  previous: deployed(1, 'a', 'inactive'),
};

describe('releasesModel', () => {
  it('counts merged PRs whose head the deployment lacks, newest first', () => {
    const pulls = [
      pull(10, 'c', 'merged'),
      pull(11, 'd', 'merged'),
      pull(12, 'e', 'open'), // open: not on main
      pull(9, 'b', 'merged'), // already deployed
    ];
    expect(unshippedPulls(compare('b', ['c', 'd']), pulls).map((p) => p.number)).toEqual([11, 10]);
  });

  it('builds one row per expected environment plus any others, live first', () => {
    const qa: EnvironmentSummary = { name: 'qa', latest: null, current: null, previous: null };
    const rows = buildEnvironmentRows(
      [production, qa],
      new Map([[sha('b'), compare('b', ['c', 'd'])]]),
      [pull(10, 'c', 'merged'), pull(11, 'd', 'merged')]
    );
    expect(rows.map((r) => r.name)).toEqual([...EXPECTED_ENVIRONMENTS, 'qa']);

    const prod = rows[0]!;
    expect(prod.configured).toBe(true);
    expect(prod.current?.shortSha).toBe('bbbbbbb');
    expect(prod.current?.release).toBe('rel-b');
    expect(prod.previous?.shortSha).toBe('aaaaaaa');
    expect(prod.pendingAttempt?.state).toBe('failure');
    expect(prod.url).toBe('https://git.neverhuman.org');
    expect(prod.commitsBehind).toBe(2);
    expect(behindLabel(prod)).toBe('2 PRs (2 commits) behind');

    const canary = rows.find((r) => r.name === 'canary')!;
    expect(canary.configured).toBe(false);
    expect(canary.current).toBeNull();
    expect(behindLabel(canary)).toBeNull();
  });

  it('says up to date, and stays silent when the compare is unknown', () => {
    const rows = buildEnvironmentRows([production], new Map([[sha('b'), compare('b', [])]]), []);
    expect(behindLabel(rows[0]!)).toBe('up to date');
    expect(rows[0]!.pendingAttempt?.shortSha).toBe('ccccccc');

    const unknown = buildEnvironmentRows([production], new Map(), null);
    expect(unknown[0]!.commitsBehind).toBeNull();
    expect(behindLabel(unknown[0]!)).toBeNull();
  });

  it('reports commits alone when the pull list is unavailable', () => {
    const rows = buildEnvironmentRows([production], new Map([[sha('b'), compare('b', ['c'])]]), null);
    expect(behindLabel(rows[0]!)).toBe('1 commit behind');
  });
});
