// runnerRows.test.ts — the words a /runners row says, as pure functions.

import { describe, expect, it } from 'vitest';

import {
  durationWords,
  networkSentence,
  pullRefFromLabel,
  rowLast,
  rowNow,
  runnerName,
  runnerNetworkFromResponse,
  seenStale,
  type RunnerNetworkNode
} from '../runnerNetworkModel';

const NOW = new Date('2026-09-19T19:01:00Z').getTime();

function node(overrides: Partial<RunnerNetworkNode> = {}): RunnerNetworkNode {
  return {
    runnerId: 'xbabe2/slot0',
    kind: 'gate',
    source: 'pr-gate-runner',
    state: 'active',
    availability: 'online',
    activityState: 'idle',
    capacity: 1,
    inFlight: 0,
    labels: ['xbabe2', 'slot 0', 'pr-gate'],
    classes: ['pr-gate'],
    activeTaskCount: 0,
    lastUpdated: '2026-09-19T19:00:48Z',
    tasks: [],
    lastActivity: null,
    ...overrides
  };
}

function task(
  label: string,
  startedAt: string | null
): RunnerNetworkNode['tasks'][number] {
  return {
    taskId: `t-${label}`,
    jobId: label,
    agentRunId: null,
    workcellId: null,
    repo: null,
    label,
    program: 'just required',
    state: 'running',
    startedAt,
    updatedAt: null,
    ttyState: 'missing',
    lastTtyLine: null
  };
}

describe('runner rows in words', () => {
  it('names a runner by host and slot, and a reviewer by host and role', () => {
    expect(runnerName('xbabe2/slot0')).toBe('xbabe2 · slot 0');
    expect(runnerName('xbabe0/redteam')).toBe('xbabe0 · redteam');
    expect(runnerName('local')).toBe('local');
  });

  it('says durations the way a person would', () => {
    expect(durationWords(14)).toBe('14s');
    expect(durationWords(127)).toBe('2m 7s');
    expect(durationWords(120)).toBe('2m');
    expect(durationWords(3780)).toBe('1h 3m');
    expect(durationWords(-5)).toBe('0s');
  });

  it('reads the pull request out of a task label', () => {
    expect(pullRefFromLabel('jeryu/jeryu-deploy#59')).toEqual({
      repo: 'jeryu/jeryu-deploy',
      pr: 59
    });
    expect(pullRefFromLabel('local task')).toBeNull();
    expect(pullRefFromLabel('jeryu/jeryu-deploy#0')).toBeNull();
  });

  it('says what a runner is doing now', () => {
    expect(rowNow(node(), NOW)).toMatchObject({
      text: 'idle',
      tone: 'neutral',
      subject: null
    });
    expect(rowNow(node({ availability: 'offline' }), NOW)).toMatchObject({
      text: 'offline',
      tone: 'danger'
    });
    const gating = rowNow(
      node({
        activityState: 'active',
        tasks: [task('veox/jain-web#13', '2026-09-19T18:59:40Z')]
      }),
      NOW
    );
    expect(gating).toMatchObject({
      text: 'gating',
      subject: 'veox/jain-web#13',
      pull: { repo: 'veox/jain-web', pr: 13 },
      elapsed: '1m 20s'
    });
    const reviewing = rowNow(
      node({ kind: 'reviewer', tasks: [task('jeryu/jeryu-web#43', null)] }),
      NOW
    );
    expect(reviewing).toMatchObject({ text: 'reviewing', elapsed: null });
    expect(rowNow(node({ tasks: [task('local task', null)] }), NOW).text).toBe(
      'running'
    );
    // A draining runner finishes what it has and says so.
    expect(rowNow(node({ availability: 'draining' }), NOW)).toMatchObject({
      text: 'draining',
      tone: 'warning',
      draining: true,
    });
    expect(
      rowNow(
        node({ availability: 'draining', tasks: [task('local task', null)] }),
        NOW
      )
    ).toMatchObject({ text: 'running', draining: true });
  });

  it('says what a runner did last, gates and reviews in their own words', () => {
    const last = {
      repo: 'jeryu/jeryu-deploy',
      pr: 59,
      sha: 'e96ed84e996654d7',
      recipe: 'just required',
      seconds: 127,
      finishedAt: '2026-09-19T16:56:27Z'
    };
    expect(rowLast(node())).toBeNull();
    expect(
      rowLast(node({ lastActivity: { ...last, conclusion: 'success' } }))
    ).toMatchObject({
      verb: 'passed',
      verbFirst: false,
      duration: '2m 7s',
      tone: 'success'
    });
    expect(
      rowLast(node({ lastActivity: { ...last, conclusion: 'failure' } }))
    ).toMatchObject({
      verb: 'failed',
      tone: 'danger'
    });
    expect(
      rowLast(node({ lastActivity: { ...last, conclusion: 'error' } }))?.verb
    ).toBe('errored');
    const reviewer = (conclusion: string) =>
      rowLast(
        node({
          kind: 'reviewer',
          lastActivity: { ...last, conclusion, seconds: 14 }
        })
      );
    expect(reviewer('approve')).toMatchObject({
      verb: 'approved',
      verbFirst: true,
      tone: 'success',
      duration: '14s'
    });
    expect(reviewer('hold')).toMatchObject({ verb: 'held', tone: 'danger' });
    expect(reviewer('too_large')).toMatchObject({
      verb: 'no usable verdict on',
      tone: 'warning'
    });
  });

  it('says why an approval has not merged instead of a plain approved', () => {
    const approved = {
      repo: 'veox-ai/ai-veox-app',
      pr: 6,
      sha: '3926cbd7',
      recipe: 'redteam-review',
      conclusion: 'approve',
      seconds: 14,
      finishedAt: '2026-09-19T19:00:30Z'
    };
    const refused = rowLast(
      node({
        kind: 'reviewer',
        lastActivity: {
          ...approved,
          mergeAttempt: {
            result: 'refused',
            status: 409,
            code: 'queue_merge_commits',
            message: 'the pull request contains merge commits; rebase it onto the base',
            at: '2026-09-19T19:00:50Z'
          }
        }
      })
    );
    expect(refused).toMatchObject({
      verb: 'approved',
      tone: 'warning',
      blocked:
        'queue_merge_commits - the pull request contains merge commits; rebase it onto the base'
    });
    const noGrant = rowLast(
      node({
        kind: 'reviewer',
        lastActivity: approved,
        mergeGrantGaps: [
          {
            repo: 'veox-ai/ai-veox-app',
            identity: 'jain-merge-bot',
            message: 'jain-merge-bot has no write grant on veox-ai/ai-veox-app; its merges answer 403'
          }
        ]
      })
    );
    expect(noGrant?.blocked).toContain('no write grant');
    const landed = rowLast(
      node({
        kind: 'reviewer',
        lastActivity: {
          ...approved,
          mergeAttempt: { result: 'queued', status: 201, at: '2026-09-19T19:00:50Z' }
        }
      })
    );
    expect(landed).toMatchObject({ tone: 'success', blocked: null });
  });

  it('reads the merge attempt and grant gaps a reviewer row carries', () => {
    const state = runnerNetworkFromResponse({
      local: {
        nodeDetails: [
          {
            runnerId: 'xbabe0/redteam',
            source: 'pr-redteam',
            state: 'active',
            capacity: 0,
            inFlight: 0,
            labels: ['xbabe0', 'slot 0', 'redteam'],
            classes: ['reviewer'],
            activeTaskCount: 0,
            lastUpdated: '2026-09-19T19:00:48Z',
            activeTasks: [],
            lastActivity: {
              repo: 'veox-ai/ai-veox-app',
              pr: 6,
              sha: '3926cbd7',
              recipe: 'redteam-review',
              conclusion: 'approve',
              seconds: 14,
              finishedAt: '2026-09-19T19:00:30Z',
              mergeAttempt: {
                result: 'refused',
                status: 403,
                code: 'permission_denied',
                message: 'repository access denied',
                actor: 'jain-merge-bot',
                at: '2026-09-19T19:00:40Z'
              }
            },
            mergeGrantGaps: [
              { repo: 'veox-ai/ai-veox-app', identity: 'jain-merge-bot', message: 'no grant' }
            ]
          }
        ]
      }
    } as never);
    const reviewer = state.reviewers[0];
    expect(reviewer.mergeGrantGaps).toHaveLength(1);
    expect(rowLast(reviewer)?.blocked).toBe('permission_denied - repository access denied');
  });

  it('flags a runner not heard from for three minutes', () => {
    expect(seenStale('2026-09-19T19:00:48Z', NOW)).toBe(false);
    expect(seenStale('2026-09-19T18:57:00Z', NOW)).toBe(true);
    expect(seenStale(null, NOW)).toBe(true);
    expect(seenStale('not a date', NOW)).toBe(true);
  });

  it('says the whole gate network in one sentence, red only when something is offline', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      node({ runnerId: `xbabe2/slot${i}` })
    );
    expect(networkSentence(six)).toEqual({
      text: '6 gate runners on xbabe2: all idle · 0 offline',
      tone: 'neutral'
    });
    const mixed = [
      node({ runnerId: 'xbabe2/slot0', activityState: 'active' }),
      node({ runnerId: 'xbabe2/slot1', activityState: 'active' }),
      node({ runnerId: 'xbabe3/slot0' }),
      node({
        runnerId: 'xbabe3/slot1',
        availability: 'offline',
        activityState: 'unknown'
      })
    ];
    expect(networkSentence(mixed)).toEqual({
      text: '4 gate runners on xbabe2, xbabe3: 2 busy, 1 idle · 1 offline',
      tone: 'danger'
    });
    expect(networkSentence([node({ activityState: 'active' })]).text).toBe(
      '1 gate runner on xbabe2: all busy · 0 offline'
    );
    expect(networkSentence([])).toEqual({
      text: 'No gate runner is reporting.',
      tone: 'warning'
    });
  });
});
