// histogramWindow.contract.test.ts — pins the window query the volume band
// sends to what the server accepts. The band asks for 30 d in `hours`, a
// parameter the route index cannot pin because it lists paths, not query
// params: a server that range-checks `hours` would refuse the ask and the
// band would vanish. The accepted window lives in a hand-maintained copy of
// the server's own bounds (src/test/fixtures/server-histogram-window.json).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HISTOGRAM_RANGES, rangeHours, rangeQuery } from '../activity/histogramModel';

interface WindowContract {
  range_values: string[];
  hours_min: number;
  hours_max: number;
  max_buckets: number;
  default_bucket_seconds_for_hours: Array<{ up_to_hours: number; seconds: number }>;
}

const contract = JSON.parse(
  readFileSync(join(process.cwd(), 'src/test/fixtures/server-histogram-window.json'), 'utf8')
) as WindowContract;

/** The bucket the server picks for a window asked for in `hours` alone. */
function defaultBucketSeconds(hours: number): number {
  const step = contract.default_bucket_seconds_for_hours.find((candidate) => hours <= candidate.up_to_hours);
  return step?.seconds ?? contract.default_bucket_seconds_for_hours[contract.default_bucket_seconds_for_hours.length - 1].seconds;
}

describe('histogram window contract', () => {
  it('sends every drawn range as a window the server accepts', () => {
    for (const range of HISTOGRAM_RANGES) {
      const query = rangeQuery(range.id);
      if (query.range !== undefined) {
        expect(
          contract.range_values,
          `range=${query.range} is not one the server's \`range\` accepts`
        ).toContain(query.range);
        expect(query.hours, 'range and hours together are refused as two windows').toBeUndefined();
        continue;
      }
      // Named by no `range`, so it is asked for in hours, which is bounded.
      expect(query.hours, `${range.id} sends neither range nor hours`).toBe(range.hours);
      expect(query.hours).toBeGreaterThanOrEqual(contract.hours_min);
      expect(
        query.hours,
        `hours=${query.hours} is over the ${contract.hours_max} the server allows, which it refuses rather than clamps`
      ).toBeLessThanOrEqual(contract.hours_max);
      // The band names no bucket, so the server's default must keep the
      // answer under the bucket count one response holds.
      expect(Math.ceil((query.hours as number) * 3600 / defaultBucketSeconds(query.hours as number))).toBeLessThanOrEqual(
        contract.max_buckets
      );
    }
  });

  it('never asks for a window the server has no name for as a range', () => {
    for (const range of HISTOGRAM_RANGES) {
      if (contract.range_values.includes(range.id)) continue;
      expect(rangeQuery(range.id).range, `${range.id} is sent as a range the server refuses`).toBeUndefined();
    }
    // 30 d is the one such window today, and it is the whole month the log keeps.
    expect(rangeHours('30d')).toBe(720);
    expect(rangeQuery('30d')).toEqual({ hours: 720 });
  });
});
