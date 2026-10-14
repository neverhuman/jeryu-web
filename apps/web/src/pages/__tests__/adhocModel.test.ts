// adhocModel.test.ts — the ad-hoc section's decisions without a browser: the
// cut read from the address, when the section shows, the tiles, the table's
// rows and remainder, and the weekly bars.

import { describe, expect, it } from 'vitest';

import type { YieldAdhoc } from '../../api/types';
import {
  DEFAULT_ADHOC_BY,
  adhocGroups,
  adhocRemainder,
  adhocShare,
  adhocState,
  adhocSummary,
  adhocTiles,
  adhocWeekBars,
  adhocWeekSummary,
  parseAdhocBy,
} from '../yield/adhocModel';
import { ADHOC } from './yieldTestData';

const NOTHING: YieldAdhoc = {
  total_usd: 0,
  sessions: 0,
  unattributed_usd: 0,
  by_family: [],
  by_repo: [],
  by_agent: [],
  by_model: [],
  weekly: [],
};

describe('adhocModel', () => {
  it('reads the cut from the address, defaulting to family', () => {
    expect(parseAdhocBy(new URLSearchParams('adhoc=repo'))).toBe('repo');
    expect(parseAdhocBy(new URLSearchParams('adhoc=week'))).toBe(DEFAULT_ADHOC_BY);
    expect(parseAdhocBy(new URLSearchParams(''))).toBe('family');
  });

  it('hides the section on an older server and says when nothing was spent', () => {
    expect(adhocState(undefined)).toBe('absent');
    expect(adhocState(NOTHING)).toBe('quiet');
    expect(adhocState(ADHOC)).toBe('spent');
    expect(adhocState({ ...NOTHING, total_usd: 0.5, unattributed_usd: 0.5 })).toBe('spent');
  });

  it('heads the section with the total, the sessions and what is unattributed', () => {
    const tiles = adhocTiles(ADHOC);
    expect(tiles.map((tile) => [tile.id, tile.value])).toEqual([
      ['total', '$12.34'],
      ['sessions', '7'],
      ['unattributed', '$1.20'],
    ]);
    expect(tiles[0].detail).toBe('not in cost per merged change');
    expect(tiles[1].detail).toBe('$1.76 a session on average');
    expect(tiles[2].detail).toBe('10% named no repository or family');
    expect(adhocTiles(NOTHING)[1].detail).toBe('no session reported spend');
    expect(adhocSummary(ADHOC, 28)).toBe(
      '$12.34 over 7 sessions people ran by hand in the last 28 days, outside the todo queue.'
    );
  });

  it('gives each cut its rows, a share of the total, and what no row carries', () => {
    expect(adhocGroups(ADHOC, 'repo').map((row) => row.group)).toEqual(['acme/widgets', 'globex/gears']);
    expect(adhocGroups(ADHOC, 'model').map((row) => row.group)).toEqual(['model-x', 'model-y']);
    expect(adhocShare(ADHOC.by_agent[0], ADHOC)).toBe('89%');
    expect(adhocShare({ usd: 1 }, NOTHING)).toBe('—');

    expect(adhocRemainder(ADHOC, 'family')).toEqual({ label: 'No family', usd: expect.closeTo(1.2, 5) });
    expect(adhocRemainder(ADHOC, 'repo')).toEqual({ label: 'No repository', usd: expect.closeTo(2, 5) });
    expect(adhocRemainder(ADHOC, 'agent')).toBeNull();
  });

  it('draws a bar per week against the largest, and says it in words', () => {
    const bars = adhocWeekBars(ADHOC.weekly);
    expect(bars.map((bar) => bar.week)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(bars[1].fraction).toBe(1);
    expect(bars[0].fraction).toBeCloseTo(3 / 6.34);
    expect(bars[0].title).toBe('Week of 2026-09-21: $3.00');
    expect(adhocWeekSummary(bars)).toBe(
      'Ad-hoc spend by week, 2026-09-21 to 2026-10-05: 2026-09-21 $3.00, 2026-09-28 $6.34, 2026-10-05 $3.00.'
    );
    expect(adhocWeekBars([{ week: '2026-09-21', usd: 0 }])).toEqual([]);
    expect(adhocWeekSummary([])).toBe('Ad-hoc spend by week: no spend in this window.');
  });
});
