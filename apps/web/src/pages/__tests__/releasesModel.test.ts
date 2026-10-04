import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../../../../contracts/generated/PullRequestSummary';
import type {
  CompareResponse,
  DeploymentState,
  DeploymentWithStatus,
  EnvironmentSummary,
} from '../../api/types/deployments';
import {
  attemptLabel,
  behindLabel,
  buildEnvironmentRows,
  EXPECTED_ENVIRONMENTS,
  releasePullHref,
  releaseScopeOptions,
  safeLogUrl,
  scopeParams,
  splitEnvironments,
  timelineHref,
  workHref,
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
it('does not present a partial compare as an exact PR count', () => {
  const capped = { ...compare('b', ['c']), ahead_by: 251, truncated: true };
  const rows = buildEnvironmentRows(
    [production],
    new Map([[sha('b'), capped]]),
    [pull(10, 'c', 'merged'), pull(11, 'd', 'merged')]
  );
  expect(rows[0]!.unshipped).toBeNull();
  expect(rows[0]!.commitsBehind).toBe(251);
  expect(behindLabel(rows[0]!)).toBe('251 commits behind');
});

  it('carries a deploy log link only when it is http(s) or an app path', () => {
    const failed = deployed(3, 'c', 'failure');
    failed.status!.log_url = 'https://git.neverhuman.org/logs/rel-c.txt';
    const rows = buildEnvironmentRows([{ ...production, latest: failed }], new Map(), null);
    expect(rows[0]!.pendingAttempt?.logUrl).toBe('https://git.neverhuman.org/logs/rel-c.txt');
    expect(rows[0]!.current?.logUrl).toBeNull();
    expect(safeLogUrl('/api/v1/logs/1')).toBe('/api/v1/logs/1');
    expect(safeLogUrl('//evil.example/x')).toBeNull();
    // Built from parts so the linter's no-script-url does not flag the test input itself.
    expect(safeLogUrl(['javascript', 'alert(1)'].join(':'))).toBeNull();
    expect(safeLogUrl(null)).toBeNull();
    expect(releasePullHref('forge.example', 'jeryu/jeryu-deploy', 48)).toBe(
      '/repos/forge.example/jeryu/jeryu-deploy/pulls/48'
    );
  });
});

describe('one Releases page', () => {
  it('offers known deploy repos, their families and the current scope', () => {
    const options = releaseScopeOptions(
      { repo: 'veox/jain-web', family: null },
      [
        { repo: 'jeryu/jeryu-deploy', family: 'jeryu' },
        { repo: 'veox/jain-deploy', family: null },
        { repo: 'not-a-repo', family: 'jain' },
      ]
    );
    expect(options.map((o) => o.value)).toEqual([
      'repo:jeryu/jeryu-deploy',
      'repo:veox/jain-deploy',
      'repo:veox/jain-web',
      'family:jain',
      'family:jeryu',
    ]);
    expect(options[3].label).toBe('jain family (every repository)');
  });

  it('turns a scope option back into its query, and refuses anything else', () => {
    expect(scopeParams('repo:jeryu/jeryu-deploy')).toEqual({ repo: 'jeryu/jeryu-deploy' });
    expect(scopeParams('family:jeryu')).toEqual({ family: 'jeryu' });
    expect(scopeParams('repo:nope')).toBeNull();
    expect(scopeParams('family:')).toBeNull();
    expect(scopeParams('jeryu')).toBeNull();
  });

  it('shows only environments with something live or in flight; the rest fold away', () => {
    const rows = buildEnvironmentRows([production], new Map([[sha('b'), compare('b', [])]]), []);
    const { live, quiet, undeployed } = splitEnvironments(rows);
    expect(live.map((row) => row.name)).toEqual(['production']);
    expect(quiet).toEqual([]);
    // Never deployed to: they get a line naming them, not a row each.
    expect(undeployed.map((row) => row.name)).toEqual(['stable', 'canary', 'dev']);
  });

  it('counts an environment that was only turned off as holding nothing live', () => {
    const smoke: EnvironmentSummary = {
      name: 'smoke',
      latest: deployed(4, 'd', 'inactive'),
      current: null,
      previous: null,
    };
    const rows = buildEnvironmentRows([production, smoke], new Map(), []);
    const { live, quiet } = splitEnvironments(rows);
    expect(live.map((row) => row.name)).toEqual(['production']);
    expect(quiet.map((row) => row.name)).toEqual(['smoke']);
  });

  it('keeps a failed or running deploy in the live table: it is what to act on', () => {
    const staging: EnvironmentSummary = {
      name: 'staging',
      latest: deployed(4, 'd', 'in_progress'),
      current: null,
      previous: null,
    };
    const { live } = splitEnvironments(buildEnvironmentRows([staging], new Map(), []));
    expect(live.map((row) => row.name)).toEqual(['staging']);
  });

  it('says a deploy attempt in words, and keeps the sha only where one ran', () => {
    const rows = buildEnvironmentRows(
      [
        production,
        { name: 'smoke', latest: deployed(4, 'd', 'inactive'), current: null, previous: null },
      ],
      new Map(),
      []
    );
    const prod = rows.find((row) => row.name === 'production')!;
    expect(attemptLabel(prod.pendingAttempt!)).toEqual({
      words: 'deploy failed',
      shortSha: 'ccccccc',
    });
    const smoke = rows.find((row) => row.name === 'smoke')!;
    expect(attemptLabel(smoke.pendingAttempt!)).toEqual({ words: 'turned off', shortSha: null });
  });

  it('sends merged-but-not-released questions to the Pull requests timeline', () => {
    expect(timelineHref({ repo: 'jeryu/jeryu-web' })).toBe('/in-flight?repo=jeryu%2Fjeryu-web');
    expect(timelineHref({ family: 'jeryu' })).toBe('/in-flight?family=jeryu');
    expect(timelineHref({})).toBe('/in-flight');
  });

  it('sends work not yet on a pull request to Work, scoped the same way', () => {
    expect(workHref({ repo: 'jeryu/jeryu-web' })).toBe('/work?repo=jeryu-web');
    expect(workHref({ family: 'jeryu' })).toBe('/work?family=jeryu');
    expect(workHref({})).toBe('/work');
  });
});
