// yieldHeadline.test.ts — the `headline` part of the yield report checked field
// by field: absent on an older server, counts that are not counts read 0, a
// percentile that is not a number reads null, and a "rate" outside 0..1 is not
// one.

import { describe, expect, it } from 'vitest';

import { withChecked } from '../../hooks/useYield';
import { HEADLINE, REPORT } from '../../pages/__tests__/yieldTestData';
import { parseYieldHeadline } from '../yieldHeadline';

describe('parseYieldHeadline', () => {
  it('is undefined when the server sent no object', () => {
    expect(parseYieldHeadline(undefined)).toBeUndefined();
    expect(parseYieldHeadline(null)).toBeUndefined();
    expect(parseYieldHeadline([])).toBeUndefined();
    expect(parseYieldHeadline('20%')).toBeUndefined();
  });

  it('keeps a well-formed block whole', () => {
    expect(parseYieldHeadline(JSON.parse(JSON.stringify(HEADLINE)))).toEqual(HEADLINE);
  });

  it('reads a blank for what is not a number, and keeps the reason', () => {
    const parsed = parseYieldHeadline({
      lead_time: {
        filed_to_prod_s: { n: '7', p50: 'soon', p90: -1, unknown: 'too_few_samples' },
      },
      exception_rate: { todos: 10, needed_human: 2, rate: 7, reasons: { blocked: 0, '': 3, held: 2 } },
      bad_change_rate: { changes: 4, bad: 1, rate: 0.25, flaky_reds: null },
    });
    expect(parsed?.lead_time.filed_to_prod_s).toEqual({
      n: 0,
      p50: null,
      p90: null,
      unknown: 'too_few_samples',
    });
    // A missing span is a span nothing is known about, never a zero one.
    expect(parsed?.lead_time.claim_to_main_s).toEqual({ n: 0, p50: null, p90: null });
    // 7 is not a share: the rate is unknown rather than 700%.
    expect(parsed?.exception_rate.rate).toBeNull();
    expect(parsed?.exception_rate.reasons).toEqual({ held: 2 });
    expect(parsed?.bad_change_rate).toEqual({
      changes: 4,
      bad: 1,
      rate: 0.25,
      flaky_reds: 0,
      by_repo: {},
    });
  });
});

describe('withChecked', () => {
  it('leaves a report from an older server without the field', () => {
    expect('headline' in withChecked(REPORT)).toBe(false);
  });

  it('carries the checked block', () => {
    expect(withChecked({ ...REPORT, headline: HEADLINE }).headline).toEqual(HEADLINE);
  });
});
