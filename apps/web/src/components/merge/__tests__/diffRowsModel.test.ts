import { describe, expect, it } from 'vitest';

import { flattenHunks, splitRows } from '../diffRowsModel';

const hunk = {
  header: '@@ -10,4 +10,5 @@',
  old_start: 10,
  old_lines: 4,
  new_start: 10,
  new_lines: 5,
  lines: [' keep', '-old a', '-old b', '+new a', '+new b', '+new c', ' tail']
};

describe('splitRows', () => {
  it('pairs each deletion run with the additions that follow it', () => {
    const rows = splitRows(flattenHunks([hunk]));
    expect(
      rows.map((r) =>
        r.kind === 'hunk'
          ? r.text
          : [
              r.left?.line ?? null,
              r.left?.kind ?? null,
              r.right?.line ?? null,
              r.right?.kind ?? null
            ]
      )
    ).toEqual([
      '@@ -10,4 +10,5 @@',
      [10, 'context', 10, 'context'],
      [11, 'del', 11, 'add'],
      [12, 'del', 12, 'add'],
      [null, null, 13, 'add'],
      [13, 'context', 14, 'context']
    ]);
  });

  it('leaves the right side empty for a pure deletion', () => {
    const rows = splitRows(
      flattenHunks([{ ...hunk, lines: ['-gone', ' kept'] }])
    );
    expect(rows[1]).toMatchObject({
      left: { kind: 'del', line: 10, text: 'gone' },
      right: null
    });
    expect(rows[2]).toMatchObject({ left: { line: 11 }, right: { line: 10 } });
  });
});
