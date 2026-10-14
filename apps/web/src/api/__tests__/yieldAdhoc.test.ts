// yieldAdhoc.test.ts — the `adhoc` part of the yield report checked field by
// field: absent on an older server, numbers that are not amounts read 0,
// nameless and repeated rows dropped, cuts ordered by spend, weeks by key.

import { describe, expect, it } from 'vitest';

import { ADHOC, REPORT } from '../../pages/__tests__/yieldTestData';
import { withCheckedAdhoc } from '../../hooks/useYield';
import { parseYieldAdhoc } from '../yieldAdhoc';

describe('parseYieldAdhoc', () => {
  it('is undefined when the server sent no object', () => {
    expect(parseYieldAdhoc(undefined)).toBeUndefined();
    expect(parseYieldAdhoc(null)).toBeUndefined();
    expect(parseYieldAdhoc([])).toBeUndefined();
    expect(parseYieldAdhoc('12.34')).toBeUndefined();
  });

  it('keeps a well-formed answer whole', () => {
    expect(parseYieldAdhoc(JSON.parse(JSON.stringify(ADHOC)))).toEqual(ADHOC);
  });

  it('turns missing or broken numbers and lists into nothing', () => {
    expect(parseYieldAdhoc({ total_usd: 'lots', sessions: -2, unattributed_usd: Number.NaN })).toEqual({
      total_usd: 0,
      sessions: 0,
      unattributed_usd: 0,
      by_family: [],
      by_repo: [],
      by_agent: [],
      by_model: [],
      weekly: [],
    });
  });

  it('drops nameless and repeated rows, and orders each cut by spend', () => {
    const parsed = parseYieldAdhoc({
      total_usd: 5,
      sessions: 3,
      unattributed_usd: 1,
      by_family: [
        { group: null, usd: 1, sessions: 1 },
        { group: 'globex', usd: 1, sessions: 1 },
        { group: 'acme', usd: 3, sessions: 2 },
        { group: 'acme', usd: 9, sessions: 9 },
        'acme',
      ],
      by_repo: [{ group: 'acme/widgets', usd: 3, sessions: 2 }],
      weekly: [
        { week: '2026-10-05', usd: 2 },
        { week: '2026-09-28', usd: 3 },
        { usd: 4 },
      ],
    });
    expect(parsed?.by_family).toEqual([
      { group: 'acme', usd: 3, sessions: 2 },
      { group: 'globex', usd: 1, sessions: 1 },
    ]);
    // Only the repository cut carries a family, null when the row named none.
    expect(parsed?.by_repo).toEqual([{ group: 'acme/widgets', family: null, usd: 3, sessions: 2 }]);
    expect(parsed?.weekly.map((row) => row.week)).toEqual(['2026-09-28', '2026-10-05']);
  });

  it('keeps the server\'s "(unknown)" agent and model rows, and Monday week keys', () => {
    const parsed = parseYieldAdhoc({
      total_usd: 2,
      sessions: 1,
      by_agent: [{ group: '(unknown)', usd: 2, sessions: 1 }],
      by_model: [{ group: '(unknown)', usd: 2, sessions: 1 }],
      by_repo: [{ group: 'acme/widgets', family: null, usd: 2, sessions: 1 }],
      weekly: [{ week: '2026-10-12', usd: 2 }],
    });
    expect(parsed?.by_agent[0].group).toBe('(unknown)');
    expect(parsed?.by_model[0].group).toBe('(unknown)');
    expect(parsed?.by_repo[0].family).toBeNull();
    expect(parsed?.weekly).toEqual([{ week: '2026-10-12', usd: 2 }]);
  });
});

describe('withCheckedAdhoc', () => {
  it('leaves a report from an older server without the field', () => {
    expect('adhoc' in withCheckedAdhoc(REPORT)).toBe(false);
  });

  it('carries the checked part', () => {
    expect(withCheckedAdhoc({ ...REPORT, adhoc: ADHOC }).adhoc).toEqual(ADHOC);
  });
});
