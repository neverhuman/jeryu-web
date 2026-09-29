import { describe, expect, it } from 'vitest';

import type { ShiftFamily } from '../../api/types';
import {
  UNCLAIMED_FAMILY,
  adoptionTodoText,
  groupReposByFamily,
} from '../toolAdoptionFamilies';

const FAMILIES: ShiftFamily[] = [
  {
    name: 'jeryu',
    queue_repo: 'jeryu/jeryu-todo',
    repos: [
      { name: 'jeryu-web', order: 1, owner: 'jeryu' },
      { name: 'jeryu-deploy', order: 2, owner: 'jeryu' },
    ],
    shift_tz: 'America/Los_Angeles',
    landing: 'shifts',
  },
  {
    name: 'jain-split',
    queue_repo: 'jain-split/jain-todo',
    // The jain queue's code is hosted under a different owner.
    repos: [{ name: 'jain-core', order: 1, owner: 'veox' }],
    shift_tz: 'America/Los_Angeles',
    landing: 'batch',
  },
];

describe('toolAdoptionFamilies', () => {
  it('groups repos by the family that owns them, alphabetical, unclaimed last', () => {
    const groups = groupReposByFamily(
      ['veox/jain-core', 'zz/unknown', 'jeryu/jeryu-web', 'jeryu/jeryu-deploy'],
      FAMILIES
    );
    expect(groups.map((group) => group.family)).toEqual([
      'jain-split',
      'jeryu',
      UNCLAIMED_FAMILY,
    ]);
    expect(groups[1]?.repos).toEqual(['jeryu/jeryu-deploy', 'jeryu/jeryu-web']);
    expect(groups[1]?.queueNames).toEqual(['jeryu-deploy', 'jeryu-web']);
  });

  it('matches on the bare name when the server reports no owner', () => {
    const noOwner: ShiftFamily[] = [
      { ...FAMILIES[0]!, repos: [{ name: 'jeryu-web', order: 1 }] },
    ];
    const groups = groupReposByFamily(['elsewhere/jeryu-web'], noOwner);
    expect(groups).toEqual([
      { family: 'jeryu', repos: ['elsewhere/jeryu-web'], queueNames: ['jeryu-web'] },
    ]);
  });

  it('keeps unclaimed repos actionable as a group with their own names', () => {
    const groups = groupReposByFamily(['zz/unknown'], []);
    expect(groups).toEqual([
      { family: UNCLAIMED_FAMILY, repos: ['zz/unknown'], queueNames: ['unknown'] },
    ]);
  });

  it('writes a todo whose first line is the title and names the repo and tool', () => {
    const text = adoptionTodoText('secret-scan', 'jeryu/jeryu-web');
    expect(text.split('\n')[0]).toBe('Adopt secret-scan in jeryu/jeryu-web');
    expect(text).toContain('jeryu/jeryu-web');
    expect(text).toContain('secret-scan');
  });
});
