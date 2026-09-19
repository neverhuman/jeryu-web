import { describe, expect, it } from 'vitest';

import { isSupervisor, laneLabel, spansManyHosts, splitSupervisors } from '../shift/workersModel';

const slot = (family: string, name: string, host = 'xbabe0') => ({ family, slot: name, host });

describe('workers model', () => {
  it('folds supervisors away from the slots that carry work', () => {
    const all = [slot('jeryu', 'supervisor'), slot('jeryu', 'w1'), slot('jain', 'supervisor'), slot('jain', 'w1')];
    const { workers, supervisors } = splitSupervisors(all);
    expect(workers.map((w) => `${w.family}/${w.slot}`)).toEqual(['jeryu/w1', 'jain/w1']);
    expect(supervisors).toHaveLength(2);
    expect(isSupervisor(slot('jeryu', 'w1'))).toBe(false);
  });

  it('names a lane by family and slot, and by host only across machines', () => {
    const lanes = [slot('jeryu', 'w1'), slot('jain', 'w1'), slot('veox-ai', 'w1')];
    expect(spansManyHosts(lanes)).toBe(false);
    expect(lanes.map((lane) => laneLabel(lane, false))).toEqual(['jeryu · w1', 'jain · w1', 'veox-ai · w1']);
    const spread = [slot('jeryu', 'w1', 'xbabe0'), slot('jeryu', 'w1', 'xbabe2')];
    expect(spansManyHosts(spread)).toBe(true);
    expect(laneLabel(spread[1], true)).toBe('jeryu · w1 @xbabe2');
    expect(laneLabel({ family: '', slot: 'w9', host: '' }, true)).toBe('unknown · w9');
  });
});
