// runnerAutomation.test.ts — the background timers on /runners: which group a
// node lands in, the words for what a timer last did, and when it is offline.

import { describe, expect, it } from 'vitest';

import {
  automationDid,
  automationHost,
  automationName,
  automationOffline
} from '../fleet/automationModel';
import {
  rowLast,
  runnerNetworkFromResponse,
  type RunnerNetworkNode
} from '../runnerNetworkModel';
import type {
  RunnerFabricResponse,
  RunnerLastActivity,
  RunnerNodeSummary
} from '../../api/types';

const NOW = new Date('2026-09-20T04:20:00Z').getTime();

function summary(overrides: Partial<RunnerNodeSummary>): RunnerNodeSummary {
  return {
    runnerId: 'xbabe2/slot0',
    source: 'pr-gate-runner',
    state: 'active',
    capacity: 1,
    inFlight: 0,
    labels: ['xbabe2', 'slot 0', 'pr-gate'],
    classes: ['pr-gate'],
    activeTaskCount: 0,
    lastUpdated: '2026-09-20T04:19:40Z',
    activeTasks: [],
    ...overrides
  };
}

function fabric(nodeDetails: RunnerNodeSummary[]): RunnerFabricResponse {
  return {
    schemaVersion: 'jeryu.runner_fabric/v1',
    local: {
      state: 'fresh',
      nodes: 2,
      onlineRunners: 1,
      offlineRunners: 0,
      busyRunners: 0,
      idleRunners: 1,
      totalSlots: 1,
      activeSlots: 1,
      utilization: 0,
      lastUpdated: '2026-09-20T04:19:40Z',
      nodeDetails
    },
    mirror: {
      name: 'github_actions_runners',
      state: 'missing',
      reason: 'not configured',
      docsUrl: 'docs/agent-native-standard.md'
    }
  };
}

function did(overrides: Partial<RunnerLastActivity>): RunnerLastActivity {
  return {
    repo: 'jeryu/jeryu-deploy',
    pr: null,
    sha: 'ea04cac1f05eadc15694dd1434d9f8f99c44a0d3',
    recipe: 'auto-pin',
    conclusion: 'opened',
    seconds: 0,
    finishedAt: '2026-09-20T04:10:00Z',
    ...overrides
  };
}

function timer(overrides: Partial<RunnerNetworkNode> = {}): RunnerNetworkNode {
  return {
    runnerId: 'xbabe0/auto-pin',
    kind: 'automation',
    source: 'automation',
    state: 'active',
    availability: 'online',
    activityState: 'idle',
    capacity: 0,
    inFlight: 0,
    labels: ['xbabe0', 'slot 0', 'automation'],
    classes: ['automation'],
    activeTaskCount: 0,
    lastUpdated: '2026-09-20T04:16:00Z',
    tasks: [],
    lastActivity: null,
    offlineAfterSeconds: 900,
    ...overrides
  };
}

describe('automation runners', () => {
  it('lists a timer under automation only, never as a gate slot or a reviewer', () => {
    const network = runnerNetworkFromResponse(
      fabric([
        summary({}),
        summary({
          runnerId: 'xbabe0/redteam',
          source: 'pr-redteam',
          capacity: 0,
          labels: ['xbabe0', 'slot 0', 'redteam'],
          classes: ['reviewer']
        }),
        summary({
          runnerId: 'xbabe0/auto-stage',
          source: 'automation',
          capacity: 0,
          labels: ['xbabe0', 'slot 0', 'automation'],
          classes: ['automation'],
          offlineAfterSeconds: 900,
          lastActivity: did({ recipe: 'auto-stage', conclusion: 'staged' })
        })
      ])
    );
    expect(network.nodes.map((node) => node.runnerId)).toEqual(['xbabe2/slot0']);
    expect(network.reviewers.map((node) => node.runnerId)).toEqual([
      'xbabe0/redteam'
    ]);
    expect(network.automation.map((node) => node.runnerId)).toEqual([
      'xbabe0/auto-stage'
    ]);
    expect(network.automation[0]).toMatchObject({
      kind: 'automation',
      offlineAfterSeconds: 900
    });
    expect(network.automation[0]?.lastActivity?.pr).toBeNull();
    // The timer holds no slot, so the gate totals do not count it.
    expect(network.totals.nodes).toBe(1);
  });

  it('has no automation group from a forge that reports none', () => {
    const network = runnerNetworkFromResponse(fabric([summary({})]));
    expect(network.automation).toEqual([]);
    expect(network.nodes[0]?.offlineAfterSeconds).toBeNull();
  });

  it('names a timer plainly and says where it runs', () => {
    expect(automationName(timer())).toBe('Auto-pin');
    expect(automationName(timer({ runnerId: 'xbabe0/auto-stage' }))).toBe(
      'Auto-stage'
    );
    expect(
      automationName(
        timer({ runnerId: 'stager', lastActivity: did({ recipe: 'auto-stage' }) })
      )
    ).toBe('Auto-stage');
    expect(automationHost(timer())).toBe('xbabe0');
    expect(automationHost(timer({ runnerId: 'stager' }))).toBe('xbabe0');
  });

  it('says what a timer last did, with the link only when there is a pull request', () => {
    const words = (last: Partial<RunnerLastActivity>): string => {
      const said = automationDid(timer({ lastActivity: did(last) }));
      return said ? `${said.before}${said.link ?? ''}${said.after}` : '';
    };
    expect(words({ conclusion: 'opened', pr: 74 })).toBe('opened jeryu-deploy#74');
    expect(words({ conclusion: 'staged', sha: '77dc3310aa5e' })).toBe(
      'staged 77dc331'
    );
    expect(words({ conclusion: 'waiting', pr: 71 })).toBe(
      'waiting for #71 to land'
    );
    expect(words({ conclusion: 'waiting' })).toBe(
      'waiting for ea04cac to go green'
    );
    expect(words({ conclusion: 'failed' })).toBe('failed on ea04cac');
    expect(words({ conclusion: 'opened' })).toBe(
      'opened a pull request for ea04cac'
    );
    expect(words({ conclusion: 'paused' })).toBe('paused ea04cac');

    expect(
      automationDid(timer({ lastActivity: did({ conclusion: 'opened', pr: 74 }) }))
    ).toMatchObject({
      pull: { repo: 'jeryu/jeryu-deploy', pr: 74 },
      link: 'jeryu-deploy#74',
      tone: 'unknown',
      finishedAt: '2026-09-20T04:10:00Z'
    });
    // Red is for what needs a person: only a failure.
    expect(
      automationDid(timer({ lastActivity: did({ conclusion: 'failed', pr: 74 }) }))
    ).toMatchObject({ pull: null, link: null, tone: 'failed' });
    expect(
      automationDid(timer({ lastActivity: did({ conclusion: 'staged' }) }))
    ).toMatchObject({ pull: null, link: null });
    expect(automationDid(timer())).toBeNull();
  });

  it('goes offline by the interval the forge reports, else by the flat three minutes', () => {
    const seenAgo = (seconds: number, offlineAfterSeconds: number | null) =>
      automationOffline(
        timer({
          lastUpdated: new Date(NOW - seconds * 1000).toISOString(),
          offlineAfterSeconds
        }),
        NOW
      );
    // A five-minute timer, four minutes after its beat, is healthy.
    expect(seenAgo(240, 900)).toBe(false);
    expect(seenAgo(900, 900)).toBe(false);
    expect(seenAgo(901, 900)).toBe(true);
    // An older forge sends no threshold: the page's current rule applies.
    expect(seenAgo(170, null)).toBe(false);
    expect(seenAgo(240, null)).toBe(true);
    // The forge's own verdict is believed, and a timer never seen is offline.
    expect(automationOffline(timer({ availability: 'offline' }), NOW)).toBe(true);
    expect(automationOffline(timer({ lastUpdated: null }), NOW)).toBe(true);
  });

  it('words a gate job that had no pull request without inventing one', () => {
    const gate = timer({
      kind: 'gate',
      lastActivity: did({ conclusion: 'success', seconds: 46 })
    });
    expect(rowLast(gate)).toMatchObject({
      pull: null,
      subject: 'jeryu/jeryu-deploy@ea04cac',
      verb: 'passed'
    });
    expect(
      rowLast(timer({ kind: 'gate', lastActivity: did({ conclusion: 'success', pr: 31 }) }))
    ).toMatchObject({
      pull: { repo: 'jeryu/jeryu-deploy', pr: 31 },
      subject: 'jeryu/jeryu-deploy#31'
    });
  });
});
