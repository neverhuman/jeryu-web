import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../../../../contracts/generated/PullRequestSummary';
import type { CompareResponse } from '../../api/types/deployments';
import { baselineFrom } from '../../hooks/useRepoUnreleased';
import {
  classifyPulls,
  repoSummary,
  visibleRows,
  type ReleaseBaseline,
} from '../unreleasedModel';

const sha = (c: string) => c.repeat(40);

function pull(
  number: number,
  state: PullRequestSummary['state'],
  head: string,
  extra: {
    checks?: Partial<PullRequestSummary['checks']>;
    approvals?: number;
    draft?: boolean;
    updated?: string;
  } = {}
): PullRequestSummary {
  return {
    repo: { id: 'r1', host: 'jeryu', owner: 'jeryu', name: 'svc' },
    number,
    entity: { kind: 'pull_request', id: String(number) },
    title: `change ${number}`,
    author: 'alton',
    head_ref: `feat/${number}`,
    base_ref: 'main',
    head_sha: sha(head),
    base_sha: sha('0'),
    state,
    draft: extra.draft ?? false,
    mergeable: { can_merge: true, level: 'clean' } as PullRequestSummary['mergeable'],
    review: {
      required_approvals: 1,
      approvals: extra.approvals ?? 0,
      changes_requested: 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: { total: 2, passing: 2, failing: 0, pending: 0, skipped: 0, ...extra.checks },
    agents: {} as PullRequestSummary['agents'],
    labels: [],
    updated_at: extra.updated ?? `2026-09-1${number % 10}T00:00:00Z`,
    passport_hash: null,
    available_actions: [],
  };
}

function compare(base: string, commits: string[], truncated = false, aheadBy = commits.length): CompareResponse {
  return {
    base: sha(base),
    head: 'main',
    base_sha: sha(base),
    head_sha: sha(commits.at(-1) ?? base),
    ahead_by: aheadBy,
    behind_by: 0,
    commits: commits.map((c, i) => ({
      sha: sha(c),
      summary: `commit ${c}`,
      author: 'dev',
      committed_at: `2026-09-18T0${i}:00:00Z`,
    })),
    truncated,
  };
}

const pulls = [
  pull(1, 'merged', 'a'),
  pull(2, 'merged', 'b'),
  pull(3, 'merged', 'c'),
  pull(4, 'open', 'x', { checks: { failing: 1, passing: 1 } }),
  pull(5, 'open', 'y'),
  pull(6, 'open', 'z', { checks: { total: 0, passing: 0 } }),
  pull(7, 'closed', 'w'),
];

const statuses = (rows: ReturnType<typeof classifyPulls>) =>
  Object.fromEntries(rows.map((row) => [row.number, row.status]));

describe('classifyPulls', () => {
  it('deployment baseline: merged PRs production lacks are unreleased, the rest released', () => {
    const baseline: ReleaseBaseline = {
      kind: 'deployment',
      name: 'rel-a',
      environment: 'production',
      sha: sha('a'),
      at: '2026-09-17T00:00:00Z',
    };
    const rows = classifyPulls(pulls, baseline, compare('a', ['b', 'c']));
    expect(statuses(rows)).toEqual({
      1: 'released',
      2: 'merged_unreleased',
      3: 'merged_unreleased',
      4: 'open_failing',
      5: 'about_to_land',
      6: 'open',
    });
    expect(rows.map((row) => row.number)).toEqual([5, 3, 2, 4, 6, 1]);
    expect(rows.find((row) => row.number === 1)?.release).toEqual({
      name: 'rel-a',
      at: '2026-09-17T00:00:00Z',
    });
    // Merge time comes from the merge commit on main when compare lists it.
    expect(rows.find((row) => row.number === 3)?.mergedAt).toBe('2026-09-18T01:00:00Z');
    expect(rows.find((row) => row.number === 5)?.mergedAt).toBeNull();
  });

  it('tag baseline: released iff the merge commit is an ancestor of the tag', () => {
    const baseline: ReleaseBaseline = { kind: 'tag', name: 'v1.2.0', sha: sha('b'), at: null };
    const rows = classifyPulls(pulls, baseline, compare('b', ['c']));
    expect(statuses(rows)).toMatchObject({ 1: 'released', 2: 'released', 3: 'merged_unreleased' });
    expect(rows.find((row) => row.number === 2)?.release).toEqual({ name: 'v1.2.0', at: null });
  });

  it('no release recorded: merged PRs are never called unreleased', () => {
    const rows = classifyPulls(pulls, { kind: 'none' }, null);
    expect(statuses(rows)).toMatchObject({
      1: 'merged_unrecorded',
      2: 'merged_unrecorded',
      3: 'merged_unrecorded',
      5: 'about_to_land',
    });
    expect(rows.every((row) => row.release === null)).toBe(true);
  });

  it('a missing or capped compare leaves unproven PRs unknown', () => {
    const baseline: ReleaseBaseline = { kind: 'tag', name: 'v1', sha: sha('a'), at: null };
    expect(statuses(classifyPulls(pulls, baseline, null))[1]).toBe('merged_unknown');
    const capped = statuses(classifyPulls(pulls, baseline, compare('a', ['c'], true, 400)));
    expect(capped[3]).toBe('merged_unreleased');
    expect(capped[1]).toBe('merged_unknown');
  });

  it('open PRs: approval alone is about to land, drafts and running checks are not', () => {
    const baseline: ReleaseBaseline = { kind: 'none' };
    const rows = classifyPulls(
      [
        pull(10, 'open', 'p', { checks: { total: 0, passing: 0 }, approvals: 1 }),
        pull(11, 'open', 'q', { draft: true }),
        pull(12, 'open', 'r', { checks: { pending: 1 } }),
      ],
      baseline,
      null
    );
    expect(statuses(rows)).toEqual({ 10: 'about_to_land', 11: 'open', 12: 'open' });
  });
});

describe('visibleRows and repoSummary', () => {
  const baseline: ReleaseBaseline = {
    kind: 'deployment',
    name: 'rel-a',
    environment: 'production',
    sha: sha('a'),
    at: '2026-09-17T00:00:00Z',
  };

  it('hides released PRs unless asked', () => {
    const rows = classifyPulls(pulls, baseline, compare('a', ['b', 'c']));
    expect(visibleRows(rows, false).some((row) => row.status === 'released')).toBe(false);
    expect(visibleRows(rows, true)).toHaveLength(rows.length);
  });

  it('says how far main is ahead of the last release', () => {
    const cmp = compare('a', ['b', 'c', 'd']);
    const rows = classifyPulls(pulls, baseline, cmp);
    expect(repoSummary(baseline, cmp, rows).text).toBe(
      'main is 3 commits / 2 PRs ahead of rel-a — releasable'
    );
    expect(repoSummary(baseline, compare('a', []), []).state).toBe('current');
    expect(repoSummary({ kind: 'none' }, null, []).text).toMatch(/^No release recorded/);
    expect(repoSummary(baseline, compare('a', ['b'], true, 300), rows).text).toBe(
      'main is 300 commits ahead of rel-a — releasable'
    );
  });
});

describe('baselineFrom', () => {
  it('prefers the live production deployment, then the release tag, then none', () => {
    const environments = {
      total_count: 1,
      environments: [
        {
          name: 'production',
          latest: null,
          previous: null,
          current: {
            deployment: {
              id: 1,
              sha: sha('a'),
              ref: 'main',
              task: 'deploy',
              environment: 'production',
              description: null,
              payload: { release: 'rel-a' },
              creator: { login: 'alton2' },
              created_at: '2026-09-17T00:00:00Z',
              production_environment: true,
              transient_environment: false,
            },
            status: null,
            succeeded: true,
          },
        },
      ],
    } as unknown as Parameters<typeof baselineFrom>[0];
    const tag = { branch: 'main', tag: 'v1', sha: sha('b'), tagged_at: '2026-09-01T00:00:00Z' };
    expect(baselineFrom(environments, tag)).toMatchObject({ kind: 'deployment', name: 'rel-a' });
    expect(baselineFrom({ total_count: 0, environments: [] }, tag)).toMatchObject({
      kind: 'tag',
      name: 'v1',
    });
    expect(
      baselineFrom({ total_count: 0, environments: [] }, { ...tag, tag: null, sha: null })
    ).toEqual({ kind: 'none' });
    expect(baselineFrom(undefined, undefined)).toBeNull();
  });
});
