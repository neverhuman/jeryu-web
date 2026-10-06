import { describe, expect, it } from 'vitest';

import type { RunnerFabricResponse, RunnerNodeSummary } from '../../../api/types';
import { runningPassesByRepo } from '../runningPasses';

function node(
  runnerId: string,
  kind: string,
  state: string,
  repo: string,
  startedAt: string
): RunnerNodeSummary {
  return {
    runnerId,
    kind,
    state,
    activeTasks: [
      {
        taskId: `${runnerId}@abc`,
        jobId: `${repo}#1`,
        agentRunId: null,
        workcellId: null,
        repo,
        label: `${repo}#1`,
        program: 'just required',
        state: 'running',
        startedAt,
        updatedAt: null,
        ttyPreview: { state: 'missing', lines: [] },
        estimate: { typicalSeconds: 600, slowSeconds: 900, samples: 4 },
      },
    ],
  } as unknown as RunnerNodeSummary;
}

function fabric(nodes: RunnerNodeSummary[]): RunnerFabricResponse {
  return { local: { nodeDetails: nodes } } as unknown as RunnerFabricResponse;
}

describe('runningPassesByRepo', () => {
  it('keys gate passes by repository, newest start winning', () => {
    const passes = runningPassesByRepo(
      fabric([
        node('build-1/slot0', 'gate', 'active', 'acme/api', '2026-10-06T12:00:00Z'),
        node('build-1/slot1', 'gate', 'active', 'acme/api', '2026-10-06T12:05:00Z'),
        node('build-2/slot0', 'gate', 'active', 'globex/web', '2026-10-06T12:01:00Z'),
      ])
    );
    expect([...passes.keys()].sort()).toEqual(['acme/api', 'globex/web']);
    expect(passes.get('acme/api')?.runnerId).toBe('build-1/slot1');
    expect(passes.get('acme/api')?.estimate?.typicalSeconds).toBe(600);
  });

  it('leaves out reviewers and offline slots', () => {
    const passes = runningPassesByRepo(
      fabric([
        node('review-1', 'reviewer', 'active', 'acme/api', '2026-10-06T12:00:00Z'),
        node('build-1/slot0', 'gate', 'offline', 'acme/web', '2026-10-06T12:00:00Z'),
      ])
    );
    expect(passes.size).toBe(0);
    expect(runningPassesByRepo(undefined).size).toBe(0);
  });
});
