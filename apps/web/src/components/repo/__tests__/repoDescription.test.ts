import { describe, expect, it } from 'vitest';

import { distinctDescriptions } from '../repoDescription';

describe('distinctDescriptions', () => {
  it('drops segments repeated down the list and keeps what differs', () => {
    const rows = [
      'Primary shared Git authority (jain)',
      'Primary shared Git authority (jain)',
      'Primary shared Git authority (jain)',
      'Shared Git authority; jekko; needs-owner',
      'Shared Git authority; jekko; needs-owner',
      'Shared Git authority; ci runner; needs-owner',
      'Core split',
      null,
    ];
    const out = distinctDescriptions(rows);
    expect(out.get('Primary shared Git authority (jain)')).toBe('');
    expect(out.get('Shared Git authority; jekko; needs-owner')).toBe('jekko');
    expect(out.get('Shared Git authority; ci runner; needs-owner')).toBe('ci runner');
    expect(out.get('Core split')).toBe('Core split');
  });
});
