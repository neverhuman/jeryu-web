// workTraceModel.test.ts — the twelve-stage work trace, from both ends: a
// todo's own fields and a pull request's posture.

import { describe, expect, it } from 'vitest';

import {
  WORK_STAGES,
  currentStage,
  pullFacts,
  stagesReached,
  todoFacts,
  workTrace,
  workTraceSummary,
} from '../shift/workTraceModel';
import { todo } from './shiftTestData';

const PULL = {
  state: 'open',
  draft: false,
  checks: { total: 2, passing: 2, failing: 0, pending: 0 },
  review: { required_approvals: 1, approvals: 0, changes_requested: 0 },
};

function stageState(facts: Parameters<typeof workTrace>[0], key: string): string {
  return workTrace(facts).find((stage) => stage.key === key)?.state ?? 'missing';
}

describe('workTrace', () => {
  it('is twelve stages with exactly one of them current, whatever the facts', () => {
    const inputs = [
      {},
      todoFacts(todo()),
      todoFacts(todo({ status: 'claimed', claim_by: 'bob@xbabe1/w2' })),
      todoFacts(todo({ status: 'blocked', attempts: 2 })),
      todoFacts(todo({ status: 'done', attempts: 1, merged: true, released: true })),
      pullFacts(PULL),
      pullFacts({ ...PULL, state: 'merged' }),
    ];
    for (const facts of inputs) {
      const stages = workTrace(facts);
      expect(stages).toHaveLength(12);
      expect(stages.map((stage) => stage.key)).toEqual(WORK_STAGES.map((stage) => stage.key));
      expect(stages.filter((stage) => stage.state === 'current')).toHaveLength(1);
    }
  });

  it('puts every stage before the current one behind it and every one after it ahead', () => {
    const stages = workTrace(todoFacts(todo({ status: 'done', attempts: 1 })));
    expect(stages.map((stage) => stage.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(workTraceSummary(stages)).toBe('stage 5 of 12: Done');
  });

  it('takes the furthest fact, so a merged todo is not stuck at Filed', () => {
    // An older server never sent `triaged`; the merge is still the position.
    const facts = todoFacts(todo({ triaged: false, merged: true }));
    expect(stagesReached(facts)).toBe(11);
    expect(stageState(facts, 'triaged')).toBe('done');
    expect(stageState(facts, 'merged')).toBe('current');
    expect(stageState(facts, 'released')).toBe('pending');
  });

  it('marks the current stage as waiting on a person for a blocked todo', () => {
    const stages = workTrace(todoFacts(todo({ status: 'blocked', attempts: 1 })));
    const current = currentStage(stages);
    expect(current?.key).toBe('worked');
    expect(current?.needsHuman).toBe(true);
    expect(workTraceSummary(stages)).toBe('stage 4 of 12: Worked, waiting on a person');
  });

  it('reads a filed, untriaged todo as waiting at Filed', () => {
    const stages = workTrace(todoFacts(todo({ triaged: false })));
    expect(currentStage(stages)?.key).toBe('filed');
    expect(currentStage(stages)?.needsHuman).toBe(false);
  });
});

describe('pullFacts', () => {
  it('starts a pull request at PR: the work before it is done by definition', () => {
    const stages = workTrace(pullFacts(PULL));
    expect(workTraceSummary(stages)).toBe('stage 8 of 12: Checks');
    expect(stages.slice(0, 7).every((stage) => stage.state === 'done')).toBe(true);
  });

  it('waits at Reviewed until the required approvals are in', () => {
    expect(workTraceSummary(workTrace(pullFacts({ ...PULL, review: { ...PULL.review, approvals: 1 } })))).toBe(
      'stage 9 of 12: Reviewed'
    );
  });

  it('calls a failing check and requested changes a person’s turn', () => {
    const failing = pullFacts({ ...PULL, checks: { total: 2, passing: 1, failing: 1, pending: 0 } });
    expect(currentStage(workTrace(failing))?.needsHuman).toBe(true);
    const changes = pullFacts({ ...PULL, review: { ...PULL.review, changes_requested: 1 } });
    expect(currentStage(workTrace(changes))?.needsHuman).toBe(true);
  });

  it('reaches the merge queue on an entry, and says so when the entry failed', () => {
    const building = workTrace(pullFacts({ ...PULL, inQueue: true, review: { ...PULL.review, approvals: 1 } }));
    expect(currentStage(building)?.key).toBe('queued');
    expect(currentStage(building)?.needsHuman).toBe(false);
    const failed = workTrace(
      pullFacts({ ...PULL, inQueue: true, queueFailed: true, review: { ...PULL.review, approvals: 1 } })
    );
    expect(currentStage(failed)?.needsHuman).toBe(true);
  });

  it('is released only once every todo it carries is', () => {
    const merged = { ...PULL, state: 'merged' as const };
    expect(currentStage(workTrace(pullFacts(merged)))?.key).toBe('merged');
    expect(
      currentStage(
        workTrace(pullFacts({ ...merged, carries: [todo({ released: true }), todo({ id: 'b', released: false })] }))
      )?.key
    ).toBe('merged');
    expect(
      currentStage(
        workTrace(pullFacts({ ...merged, carries: [todo({ released: true }), todo({ id: 'b', released: true })] }))
      )?.key
    ).toBe('released');
  });
});
