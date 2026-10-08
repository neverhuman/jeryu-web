import { describe, expect, it } from 'vitest';

import {
  filterSlots,
  hasSlotFilter,
  isSupervisor,
  laneLabel,
  slotFilterText,
  spansManyHosts,
  splitSupervisors,
} from '../shift/workersModel';

const slot = (family: string, name: string, host = 'node-0') => ({ family, slot: name, host });

describe('workers model', () => {
  it('folds supervisors away from the slots that carry work', () => {
    const all = [slot('jeryu', 'supervisor'), slot('jeryu', 'w1'), slot('jain', 'supervisor'), slot('jain', 'w1')];
    const { workers, supervisors } = splitSupervisors(all);
    expect(workers.map((w) => `${w.family}/${w.slot}`)).toEqual(['jeryu/w1', 'jain/w1']);
    expect(supervisors).toHaveLength(2);
    expect(isSupervisor(slot('jeryu', 'w1'))).toBe(false);
  });

  it('keeps the slots of one family and host, either spelling of the family key', () => {
    const all = [
      slot('jeryu', 'w1', 'node-0'),
      slot('jeryu-split', 'w2', 'node-1'),
      slot('globex', 'member-1', 'node-1'),
    ];
    expect(filterSlots(all, { family: '', hosts: [] })).toHaveLength(3);
    expect(filterSlots(all, { family: 'jeryu', hosts: [] }).map((s) => s.slot)).toEqual(['w1', 'w2']);
    expect(filterSlots(all, { family: '', hosts: ['node-1'] }).map((s) => s.slot)).toEqual([
      'w2',
      'member-1',
    ]);
    expect(filterSlots(all, { family: 'jeryu', hosts: ['node-1'] }).map((s) => s.slot)).toEqual(['w2']);
    expect(filterSlots(all, { family: 'acme', hosts: [] })).toEqual([]);
    expect(hasSlotFilter({ family: '', hosts: [] })).toBe(false);
    expect(hasSlotFilter({ family: '', hosts: ['node-1'] })).toBe(true);
    expect(slotFilterText({ family: 'globex', hosts: ['node-a', 'node-b'] })).toBe(
      'globex on node-a, node-b'
    );
    expect(slotFilterText({ family: '', hosts: ['node-a'] })).toBe('on node-a');
  });

  it('names a lane by family and slot, and by host only across machines', () => {
    const lanes = [slot('jeryu', 'w1'), slot('jain', 'w1'), slot('veox-ai', 'w1')];
    expect(spansManyHosts(lanes)).toBe(false);
    expect(lanes.map((lane) => laneLabel(lane, false))).toEqual(['jeryu · w1', 'jain · w1', 'veox-ai · w1']);
    const spread = [slot('jeryu', 'w1', 'node-0'), slot('jeryu', 'w1', 'node-2')];
    expect(spansManyHosts(spread)).toBe(true);
    expect(laneLabel(spread[1], true)).toBe('jeryu · w1 @node-2');
    expect(laneLabel({ family: '', slot: 'w9', host: '' }, true)).toBe('unknown · w9');
  });
});
