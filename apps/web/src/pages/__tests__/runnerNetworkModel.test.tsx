// runnerNetworkModel.test.tsx — pure runner-network selector coverage.

import { describe, expect, it } from 'vitest';

import {
  lastTtyLine,
  reviewVerdict,
  runnerNetworkFromResponse,
  runnerTags,
} from '../runnerNetworkModel';
import type { RunnerFabricResponse } from '../../api/types';

const EMPTY_RUNNERS: RunnerFabricResponse = {
  schemaVersion: 'jeryu.runner_fabric/v1',
  local: {
    state: 'unknown',
    nodes: 0,
    onlineRunners: 0,
    offlineRunners: 0,
    busyRunners: 0,
    idleRunners: 0,
    totalSlots: 0,
    activeSlots: 0,
    utilization: 0,
    lastUpdated: null,
    nodeDetails: [],
  },
  mirror: {
    name: 'github_actions_runners',
    state: 'missing',
    reason: 'optional GitHub mirror runner adapter is not configured',
    docsUrl: 'docs/agent-native-standard.md',
  },
};

describe('runnerNetworkModel', () => {
  it('splits redteam-labelled reviewers from the gate slots', () => {
    const node = (runnerId: string, labels: string[], capacity: number) => ({
      runnerId,
      source: capacity ? 'pr-gate-runner' : 'pr-redteam',
      state: 'active',
      capacity,
      inFlight: 0,
      labels,
      classes: [],
      activeTaskCount: 0,
      lastUpdated: '2026-09-19T05:22:00Z',
      activeTasks: [],
    });
    const state = runnerNetworkFromResponse({
      ...EMPTY_RUNNERS,
      local: {
        ...EMPTY_RUNNERS.local,
        nodeDetails: [
          node('xbabe2/slot0', ['pr-gate'], 1),
          node('xbabe0/redteam', ['xbabe0', 'redteam'], 0),
        ],
      },
    });
    expect(state.nodes.map((n) => n.runnerId)).toEqual(['xbabe2/slot0']);
    expect(state.reviewers.map((n) => [n.runnerId, n.kind])).toEqual([
      ['xbabe0/redteam', 'reviewer'],
    ]);
    expect(state.totals.nodes).toBe(1);
  });

  it('maps review conclusions to approve, hold or no usable verdict', () => {
    expect(reviewVerdict('approve')).toBe('approve');
    expect(reviewVerdict('hold')).toBe('hold');
    for (const outcome of ['failed', 'interrupted', 'too_large', 'publication_rejected', '']) {
      expect(reviewVerdict(outcome)).toBe('no usable verdict');
    }
  });

  it('returns an empty network when the runners payload is empty', () => {
    const state = runnerNetworkFromResponse(EMPTY_RUNNERS);
    expect(state.state).toBe('unknown');
    expect(state.nodes).toEqual([]);
    expect(state.totals.nodes).toBe(0);
    expect(state.totals.activeTasks).toBe(0);
  });

  it('normalizes offline nodes without inventing activity', () => {
    const state = runnerNetworkFromResponse({
      ...EMPTY_RUNNERS,
      local: {
        ...EMPTY_RUNNERS.local,
        state: 'fresh',
        nodes: 1,
        onlineRunners: 0,
        offlineRunners: 1,
        totalSlots: 10,
        activeSlots: 0,
        nodeDetails: [
          {
            runnerId: 'xbabe1',
            source: 'runnerd',
            state: 'dead',
            capacity: 10,
            inFlight: 0,
            labels: ['dogfood'],
            classes: ['native-rust-hot'],
            activeTaskCount: 0,
            lastUpdated: '2026-06-05T00:00:00Z',
            activeTasks: [],
          },
        ],
      },
    });
    expect(state.nodes[0].runnerId).toBe('xbabe1');
    expect(state.nodes[0].availability).toBe('offline');
    expect(state.nodes[0].activityState).toBe('unknown');
    expect(state.nodes[0].activeTaskCount).toBe(0);
  });

  it('keeps active nodes and task previews intact', () => {
    const state = runnerNetworkFromResponse({
      ...EMPTY_RUNNERS,
      local: {
        state: 'fresh',
        nodes: 2,
        onlineRunners: 2,
        offlineRunners: 0,
        busyRunners: 1,
        idleRunners: 1,
        totalSlots: 20,
        activeSlots: 20,
        utilization: 0.05,
        lastUpdated: '2026-06-05T00:05:00Z',
        nodeDetails: [
          {
            runnerId: 'xbabe0',
            source: 'runnerd',
            state: 'active',
            capacity: 10,
            inFlight: 1,
            labels: ['rust', 'dogfood'],
            classes: ['native-rust-clean'],
            activeTaskCount: 1,
            lastUpdated: '2026-06-05T00:05:00Z',
            activeTasks: [
              {
                taskId: 'ar-1',
                jobId: 'wc-1',
                agentRunId: 'ar-1',
                workcellId: 'wc-1',
                repo: 'jeryu/veox',
                label: 'editbot',
                program: '/workspace/repair.sh',
                state: 'running',
                startedAt: '2026-06-05T00:00:00Z',
                updatedAt: '2026-06-05T00:05:00Z',
                ttyPreview: {
                  state: 'fresh',
                  lines: ['$ repair.sh', 'running tests', 'done'],
                },
              },
            ],
          },
          {
            runnerId: 'local',
            source: 'local',
            state: 'active',
            capacity: 2,
            inFlight: 1,
            labels: ['local'],
            classes: ['native-rust-hot'],
            activeTaskCount: 1,
            lastUpdated: '2026-06-05T00:03:00Z',
            activeTasks: [
              {
                taskId: 'ar-local',
                jobId: 'wc-local',
                agentRunId: 'ar-local',
                workcellId: 'wc-local',
                repo: null,
                label: 'local-repair',
                program: '/workspace/local.sh',
                state: 'running',
                startedAt: '2026-06-05T00:01:00Z',
                updatedAt: '2026-06-05T00:03:00Z',
                ttyPreview: {
                  state: 'missing',
                  lines: [],
                },
              },
            ],
          },
        ],
      },
    });

    expect(state.nodes.map((node) => node.runnerId)).toEqual(['local', 'xbabe0']);
    expect(state.nodes[1].activityState).toBe('active');
    expect(state.nodes[1].tasks[0].lastTtyLine).toBe('done');
    expect(state.nodes[0].tasks[0].lastTtyLine).toBeNull();
    expect(state.totals.activeTasks).toBe(2);
    expect(state.lastUpdated).toBe('2026-06-05T00:05:00Z');
  });

  it('extracts the final non-empty tty line from preview chunks', () => {
    expect(
      lastTtyLine({
        state: 'fresh',
        lines: ['first line', '  ', 'second line\nthird line'],
      })
    ).toBe('third line');
    expect(lastTtyLine({ state: 'missing', lines: [] })).toBeNull();
  });

  it('carries a gate runner\'s last finished gate through to the node', () => {
    const state = runnerNetworkFromResponse({
      ...EMPTY_RUNNERS,
      local: {
        ...EMPTY_RUNNERS.local,
        state: 'fresh',
        nodes: 1,
        onlineRunners: 1,
        busyRunners: 1,
        totalSlots: 1,
        activeSlots: 1,
        nodeDetails: [
          {
            runnerId: 'xbabe2/slot0',
            source: 'pr-gate-runner',
            state: 'active',
            capacity: 1,
            inFlight: 1,
            labels: ['xbabe2', 'slot 0'],
            classes: ['pr-gate'],
            activeTaskCount: 1,
            lastUpdated: '2026-09-17T03:05:00Z',
            activeTasks: [
              {
                taskId: 'xbabe2/slot0@abc30d78',
                jobId: 'veox/jain-web#13',
                agentRunId: null,
                workcellId: null,
                repo: 'veox/jain-web',
                label: 'veox/jain-web#13',
                program: 'just required',
                state: 'running',
                startedAt: '2026-09-17T03:04:00Z',
                updatedAt: '2026-09-17T03:05:00Z',
                ttyPreview: { state: 'missing', lines: [] },
              },
            ],
            lastActivity: {
              repo: 'veox/jain-deploy',
              pr: 31,
              sha: '3926cbd7ddab0e48edc143d3b49607b3bf39bf20',
              recipe: 'just required',
              conclusion: 'success',
              seconds: 46,
              finishedAt: '2026-09-17T02:34:39Z',
            },
          },
        ],
      },
    });
    expect(state.nodes[0]?.activityState).toBe('active');
    expect(state.nodes[0]?.lastActivity?.repo).toBe('veox/jain-deploy');
    expect(state.nodes[0]?.lastActivity?.seconds).toBe(46);
  });

  it('leaves last activity empty for runners that do not report one', () => {
    const state = runnerNetworkFromResponse(EMPTY_RUNNERS);
    expect(state.nodes).toEqual([]);
  });
});

describe('runnerTags', () => {
  it('says each fact once, whatever case and whichever list it came from', () => {
    expect(
      runnerTags({ labels: ['xbabe2', 'slot 0', 'pr-gate'], classes: ['PR-GATE', ' ', 'linux'] })
    ).toEqual(['xbabe2', 'slot 0', 'pr-gate', 'linux']);
    expect(runnerTags({ labels: [], classes: [] })).toEqual([]);
  });

  it.each(['unknown', 'unrecognized-state', 'registering', ''])(
    'does not promote node state %s to online',
    (nodeState) => {
      const state = runnerNetworkFromResponse({
        ...EMPTY_RUNNERS,
        local: {
          ...EMPTY_RUNNERS.local,
          state: 'fresh',
          nodeDetails: [
            {
              runnerId: 'observed',
              source: 'runnerd',
              state: nodeState,
              capacity: 4,
              inFlight: 0,
              labels: [],
              classes: [],
              activeTaskCount: 0,
              lastUpdated: null,
              activeTasks: [],
            },
          ],
        },
      });
      expect(state.nodes[0].availability).toBe('unknown');
      expect(state.nodes[0].activityState).toBe('unknown');
      expect(state.totals.onlineNodes).toBe(0);
      expect(state.totals.idleNodes).toBe(0);
    }
  );

  it.each(['unknown', 'fresh'] as const)(
    'preserves workcell task observations without inventing registration (%s)',
    (localState) => {
      const state = runnerNetworkFromResponse({
        ...EMPTY_RUNNERS,
        local: {
          ...EMPTY_RUNNERS.local,
          state: localState,
          nodeDetails: [
            {
              runnerId: 'observed',
              source: 'workcell',
              state: 'active',
              capacity: 0,
              inFlight: 0,
              labels: [],
              classes: [],
              activeTaskCount: 1,
              lastUpdated: null,
              activeTasks: [
                {
                  taskId: 'run-observed',
                  jobId: 'cell-observed',
                  agentRunId: 'run-observed',
                  workcellId: 'cell-observed',
                  repo: 'owner/repo',
                  label: 'observed task',
                  program: '/usr/bin/agent',
                  state: 'running',
                  startedAt: null,
                  updatedAt: '2026-09-10T00:00:00Z',
                  ttyPreview: { state: 'fresh', lines: ['observed output'] },
                },
              ],
            },
          ],
        },
      });
      expect(state.nodes[0].availability).toBe('unknown');
      expect(state.nodes[0].activityState).toBe('active');
      expect(state.totals.activeTasks).toBe(1);
      expect(state.totals.onlineNodes).toBe(0);
      expect(state.nodes[0].tasks[0]).toMatchObject({
        taskId: 'run-observed',
        workcellId: 'cell-observed',
        repo: 'owner/repo',
        lastTtyLine: 'observed output',
      });
    }
  );

  it('does not treat a missing node capacity field as measured zero', () => {
    const raw: unknown = {
      ...EMPTY_RUNNERS,
      local: {
        ...EMPTY_RUNNERS.local,
        state: 'fresh',
        nodeDetails: [
          {
            runnerId: 'incomplete',
            source: 'runnerd',
            state: 'active',
            inFlight: 0,
            labels: [],
            classes: [],
            activeTaskCount: 0,
            lastUpdated: null,
            activeTasks: [],
          },
        ],
      },
    };
    const state = runnerNetworkFromResponse(raw as RunnerFabricResponse);
    expect(state.nodes[0].availability).toBe('unknown');
    expect(state.totals.onlineNodes).toBe(0);
  });

  it('reports unknown state when the snapshot itself is unavailable', () => {
    const fresh = {
      ...EMPTY_RUNNERS,
      local: { ...EMPTY_RUNNERS.local, state: 'fresh' as const },
    };
    expect(runnerNetworkFromResponse(fresh).state).toBe('fresh');
    expect(runnerNetworkFromResponse(fresh, false).state).toBe('unknown');
  });
});

