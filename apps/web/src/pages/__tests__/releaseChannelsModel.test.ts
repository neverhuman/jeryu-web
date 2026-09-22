import { describe, expect, it } from 'vitest';

import type {
  CompareResponse,
  EnvironmentsResponse,
  ReleaseTagResponse,
} from '../../api/types/deployments';
import {
  ladderBaselines,
  ladderCompares,
  ladderDetail,
  ladderReach,
  ladderUndecided,
  UNKNOWN_LADDER,
  releaseLadder,
  type LadderBaselines,
  type PipId,
} from '../releaseChannelsModel';

const sha = (c: string) => c.repeat(40);

describe('ladderBaselines', () => {
  it('takes one baseline per deployed environment, shallowest first', () => {
    const ladder = ladderBaselines(
      environments({ dev: ['d', 'v9'], production: ['p', 'v7'], stable: ['s', 'v8'] }),
      undefined
    );
    expect(ladder.kind).toBe('channels');
    expect(ladder.baselines.map((b) => b.id)).toEqual(['dev', 'stable', 'production']);
    expect(ladder.baselines.map((b) => b.name)).toEqual(['v9', 'v8', 'v7']);
  });

  it('names a baseline after its environment when the deployment carries no release', () => {
    const ladder = ladderBaselines(environments({ canary: ['c', null] }), undefined);
    expect(ladder.baselines[0]).toMatchObject({ id: 'canary', name: 'canary', sha: sha('c') });
  });

  it('ignores an environment that exists but runs nothing', () => {
    const empty: EnvironmentsResponse = {
      total_count: 1,
      environments: [{ name: 'canary', latest: null, current: null, previous: null }],
    };
    expect(ladderBaselines(empty, undefined).kind).toBe('none');
  });

  it('falls back to the newest tag when no environment is deployed', () => {
    const ladder = ladderBaselines(undefined, tag('rel-b', 't'));
    expect(ladder.kind).toBe('tag');
    expect(ladder.baselines).toEqual([
      { id: 'tag', name: 'rel-b', sha: sha('t'), at: '2026-09-10T00:00:00Z' },
    ]);
  });

  it('is `none` with neither a deployment nor a tag', () => {
    expect(ladderBaselines(undefined, tag(null, null))).toEqual({ kind: 'none', baselines: [] });
  });

  it('asks for one compare per baseline', () => {
    const ladder = ladderBaselines(environments({ dev: ['d', 'v9'], stable: ['s', 'v8'] }), undefined);
    expect(ladderCompares(ladder)).toEqual([
      { id: 'dev', base: sha('d') },
      { id: 'stable', base: sha('s') },
    ]);
  });
});

describe('releaseLadder', () => {
  const four = ladderBaselines(
    environments({
      dev: ['d', 'v9'],
      canary: ['c', 'v8'],
      stable: ['s', 'v7'],
      production: ['p', 'v6'],
    }),
    undefined
  );
  const merged = { state: 'merged' as const, head_sha: sha('a') };

  it('places a change that every channel already runs', () => {
    const ladder = releaseLadder(merged, four, compares(four, { dev: [], canary: [], stable: [], production: [] }));
    expect(ladder.pips.map((p) => p.membership)).toEqual(['in', 'in', 'in', 'in']);
    expect(ladder.furthest).toBe('production');
    expect(ladder.release).toBe('v6');
    expect(ladder.uncertain).toBe(false);
    expect(ladderReach(ladder)).toBe('done');
  });

  it('places a change that has reached canary but not stable', () => {
    const ladder = releaseLadder(
      merged,
      four,
      // stable and production still lack the change; dev and canary have it.
      compares(four, { dev: [], canary: [], stable: ['a'], production: ['a'] })
    );
    expect(ladder.pips.map((p) => p.membership)).toEqual(['in', 'in', 'out', 'out']);
    expect(ladder.furthest).toBe('canary');
    expect(ladder.release).toBe('v8');
    expect(ladderReach(ladder)).toBe('active');
    expect(ladderDetail(ladder, 'merged')).toBe('canary · v8');
  });

  it('is pending, not unknown, when every channel decidedly lacks it', () => {
    const ladder = releaseLadder(
      merged,
      four,
      compares(four, { dev: ['a'], canary: ['a'], stable: ['a'], production: ['a'] })
    );
    expect(ladder.furthest).toBeNull();
    expect(ladder.uncertain).toBe(false);
    expect(ladderReach(ladder)).toBe('pending');
    expect(ladderDetail(ladder, 'merged')).toBe('next release');
  });

  it('will not call a capped compare released', () => {
    // Production's compare came back capped: its commit list proves nothing
    // about a sha it does not mention, so production stays undecided even
    // though every shallower channel decidedly has the change.
    const capped = compares(four, {});
    capped.set('production', { ...compare([]), truncated: true });
    const ladder = releaseLadder(merged, four, capped);
    expect(ladder.pips.map((p) => p.membership)).toEqual(['in', 'in', 'in', 'unknown']);
    expect(ladder.furthest).toBe('stable');
    expect(ladder.uncertain).toBe(true);
    expect(ladderReach(ladder)).toBe('active');
    expect(ladderDetail(ladder, 'merged')).toBe('stable · v7');
  });

  it('reads release unknown when nothing at all has been decided', () => {
    const ladder = releaseLadder(merged, four, new Map([['dev', null]] as [PipId, null][]));
    // It names the release it gave up comparing against, and why.
    expect(ladderDetail(ladder, 'merged')).toBe('release unknown · dev v9 compare did not answer');
    expect(ladderReach(ladder)).toBe('unknown');
  });

  it('says which release a capped compare left undecided', () => {
    const capped = new Map<PipId, CompareResponse | null>([
      ['dev', { ...compare([]), truncated: true }],
    ]);
    const ladder = releaseLadder(merged, four, capped);
    expect(ladder.pips[0]).toMatchObject({ membership: 'unknown', undecided: 'capped', baseline: 'v9' });
    expect(ladder.pips[1]).toMatchObject({ undecided: 'unanswered' });
    expect(ladderUndecided(ladder)).toBe('dev v9 compare capped');
    expect(ladderDetail(ladder, 'merged')).toBe('release unknown · dev v9 compare capped');
    expect(ladderUndecided(UNKNOWN_LADDER)).toBe('not compared');
    expect(ladderUndecided(releaseLadder(merged, four, compares(four, { dev: [], canary: [], stable: [], production: [] })))).toBeNull();
  });

  it('leaves a channel whose compare has not answered unknown', () => {
    const ladder = releaseLadder(merged, four, new Map());
    expect(ladder.pips.map((p) => p.membership)).toEqual([
      'unknown',
      'unknown',
      'unknown',
      'unknown',
    ]);
    expect(ladderReach(ladder)).toBe('unknown');
  });

  it('settles shallower channels from a deeper one: in production means in all of them', () => {
    // Only production answered, and it has the change. The rest follow.
    const ladder = releaseLadder(
      merged,
      four,
      new Map([['production', compare([])]] as [PipId, CompareResponse][])
    );
    expect(ladder.pips.map((p) => p.membership)).toEqual(['in', 'in', 'in', 'in']);
    expect(ladder.furthest).toBe('production');
    expect(ladder.uncertain).toBe(false);
  });

  it('settles deeper channels from a shallower one: out of dev means out of all of them', () => {
    const ladder = releaseLadder(
      merged,
      four,
      new Map([['dev', compare(['a'])]] as [PipId, CompareResponse][])
    );
    expect(ladder.pips.map((p) => p.membership)).toEqual(['out', 'out', 'out', 'out']);
    expect(ladder.uncertain).toBe(false);
    expect(ladderReach(ladder)).toBe('pending');
  });

  it('puts an open or closed pull request in no channel without calling it undecided', () => {
    const open = releaseLadder({ state: 'open', head_sha: sha('a') }, four, new Map());
    expect(open.pips.map((p) => p.membership)).toEqual(['out', 'out', 'out', 'out']);
    expect(open.uncertain).toBe(false);
    expect(ladderDetail(open, 'open')).toBe('not yet');
    expect(ladderDetail(open, 'closed')).toBe('not merged');
  });

  it('reads a tag-released repository as one pip named after the tag', () => {
    const tagged = ladderBaselines(undefined, tag('rel-b', 't'));
    const ladder = releaseLadder(merged, tagged, new Map([['tag', compare([])]] as [PipId, CompareResponse][]));
    expect(ladder.kind).toBe('tag');
    expect(ladder.pips[0]).toMatchObject({ id: 'tag', label: 'rel-b', membership: 'in' });
    expect(ladderDetail(ladder, 'merged')).toBe('rel-b');
    expect(ladderReach(ladder)).toBe('done');
  });

  it('says so when a repository records no release at all', () => {
    const none = ladderBaselines(undefined, tag(null, null));
    const ladder = releaseLadder(merged, none, new Map());
    expect(ladder.pips).toEqual([]);
    expect(ladderDetail(ladder, 'merged')).toBe('no release recorded');
  });
});

// ------------------------------------------------------------------ factories

function environments(
  live: Partial<Record<string, [string, string | null]>>
): EnvironmentsResponse {
  const names = Object.keys(live);
  return {
    total_count: names.length,
    environments: names.map((name) => {
      const [commit, release] = live[name] ?? ['0', null];
      return {
        name,
        latest: null,
        previous: null,
        current: {
          deployment: {
            id: 1,
            sha: sha(commit),
            ref: 'main',
            task: 'deploy',
            environment: name,
            description: null,
            payload: release ? { release } : {},
            creator: { login: 'jeryu' },
            created_at: '2026-09-14T00:00:00Z',
            production_environment: name === 'production',
            transient_environment: false,
          },
          status: null,
          succeeded: true,
        },
      };
    }),
  };
}

function tag(name: string | null, commit: string | null): ReleaseTagResponse {
  return {
    branch: 'main',
    tag: name,
    sha: commit ? sha(commit) : null,
    tagged_at: name ? '2026-09-10T00:00:00Z' : null,
  };
}

/** A compare whose commit list holds exactly the given shas. */
function compare(missing: string[]): CompareResponse {
  return {
    base: 'base',
    head: 'main',
    base_sha: sha('0'),
    head_sha: sha('9'),
    ahead_by: missing.length,
    behind_by: 0,
    commits: missing.map((c) => ({
      sha: sha(c),
      summary: `commit ${c}`,
      author: 'alton',
      committed_at: '2026-09-15T00:00:00Z',
    })),
    truncated: false,
  };
}

function compares(
  baselines: LadderBaselines,
  missing: Partial<Record<string, string[]>>
): Map<PipId, CompareResponse> {
  const map = new Map<PipId, CompareResponse>();
  for (const baseline of baselines.baselines) {
    map.set(baseline.id, compare(missing[baseline.id] ?? []));
  }
  return map;
}
