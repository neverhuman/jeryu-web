// headlineModel.test.ts — the three factory numbers in words: durations in the
// two largest units that fit, rates in whole percent, and a number the window
// cannot support left blank with its reason beside it.

import { describe, expect, it } from 'vitest';

import type { YieldHeadline } from '../../api/types';
import {
  formatDuration,
  formatPercent,
  headlineTiles,
  spanDetail,
  topReasons,
  unknownReason,
} from '../headline/headlineModel';
import { HEADLINE } from '../../pages/__tests__/yieldTestData';

describe('formatDuration', () => {
  it('reads in the two largest units that fit', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(90)).toBe('1 m');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(4 * 3600 + 10 * 60)).toBe('4 h 10 m');
    expect(formatDuration(47 * 3600)).toBe('47 h');
    expect(formatDuration(2 * 86400 + 6 * 3600)).toBe('2 d 6 h');
    expect(formatDuration(3 * 86400)).toBe('3 d');
  });

  it('is a dash for what cannot be measured', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('rounds to whole percent and dashes an undefined rate', () => {
    expect(formatPercent(0.2)).toBe('20%');
    expect(formatPercent(0.105)).toBe('11%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('unknownReason', () => {
  it('says why a number is blank, in words a reader knows', () => {
    expect(unknownReason('too_few_samples')).toBe('too few to read a median');
    expect(unknownReason('no_merged_changes')).toBe('nothing merged in this window');
    expect(unknownReason('some_new_reason')).toBe('some new reason');
    expect(unknownReason(undefined)).toBeNull();
  });
});

describe('spanDetail', () => {
  it('names the 90th beside the median', () => {
    expect(spanDetail(HEADLINE.lead_time.claim_to_main_s, 'claim to main')).toBe(
      'claim to main: 30 todos, 2 d 12 h at the 90th'
    );
  });

  it('says how few there were when there is no median', () => {
    expect(
      spanDetail({ n: 1, p50: null, p90: null, unknown: 'too_few_samples' }, 'median')
    ).toBe('median: 1 todo, too few to read a median');
  });
});

describe('topReasons', () => {
  it('lists the reasons a person was needed, most todos first', () => {
    expect(topReasons(HEADLINE.exception_rate)).toEqual(['blocked 5', 'attempt gave up 3']);
  });
});

describe('headlineTiles', () => {
  it('leads with lead time and explains each number', () => {
    const [lead, exception, bad] = headlineTiles(HEADLINE);
    expect(lead).toEqual({
      id: 'lead-time',
      label: 'Lead time, filed to production',
      value: '2 d 6 h',
      detail: 'median: 30 todos, 9 d at the 90th · claim to main: 30 todos, 2 d 12 h at the 90th',
    });
    expect(exception.value).toBe('20%');
    expect(exception.detail).toBe('8 of 40 todos · blocked 5 · attempt gave up 3');
    expect(bad.value).toBe('10%');
    expect(bad.detail).toBe(
      '3 of 30 merged changes turned main red or failed to deploy, 2 red stretches a rerun cleared'
    );
  });

  it('leaves a number the window cannot support blank, with its reason', () => {
    const thin: YieldHeadline = {
      lead_time: {
        filed_to_prod_s: { n: 2, p50: null, p90: null, unknown: 'too_few_samples' },
        claim_to_main_s: { n: 0, p50: null, p90: null, unknown: 'too_few_samples' },
      },
      exception_rate: { todos: 0, needed_human: 0, rate: null, reasons: {} },
      bad_change_rate: {
        changes: 0,
        bad: 0,
        rate: null,
        unknown: 'no_merged_changes',
        flaky_reds: 0,
        by_repo: {},
      },
    };
    const [lead, exception, bad] = headlineTiles(thin);
    expect(lead.value).toBe('—');
    expect(lead.detail).toBe(
      'median: 2 todos, too few to read a median · claim to main: 0 todos, too few to read a median'
    );
    expect(exception.value).toBe('—');
    expect(exception.detail).toBe('0 of 0 todos');
    expect(bad.value).toBe('—');
    expect(bad.detail).toBe('nothing merged in this window');
  });
});
