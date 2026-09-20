// qualityGateModel.test.ts — the arithmetic behind the Quality gate pages.

import { describe, expect, it } from 'vitest';

import {
  dailyGeometry,
  percent,
  qualityGateHeadPath,
  qualityGateRulePath,
  repoCodeHref,
  shortSha,
  sortRepos,
  sortRules,
  topFailingRule,
  windowSummary,
} from '../qualityGate/qualityGateModel';
import { OVERVIEW } from './qualityGateTestData';

describe('qualityGateModel', () => {
  it('orders rules worst first and names the one to drill into', () => {
    expect(sortRules(OVERVIEW.rules).map((rule) => rule.rule)).toEqual([
      'stale-naming',
      'evidence-link',
      'untested-path',
    ]);
    expect(topFailingRule(OVERVIEW.rules)?.rule).toBe('stale-naming');
  });

  it('has no rule to drill into when nothing failed', () => {
    const quiet = OVERVIEW.rules.map((rule) => ({ ...rule, failures: 0 }));
    expect(topFailingRule(quiet)).toBeUndefined();
  });

  it('orders repositories by fail rate', () => {
    expect(sortRepos(OVERVIEW.repos).map((repo) => repo.repo)).toEqual([
      'jeryu/jeryu-web',
      'jeryu/jeryu-deploy',
    ]);
  });

  it('shows a rate as whole percent, and a dash when there was nothing to rate', () => {
    expect(percent(0.25, 40)).toBe('25%');
    expect(percent(0, 0)).toBe('—');
  });

  it('stacks each day pass over fail against the tallest day', () => {
    const geo = dailyGeometry(OVERVIEW.daily, 300, 100);
    expect(geo.max).toBe(10);
    expect(geo.bars).toHaveLength(3);
    const [first] = geo.bars;
    // 10 of 10 scored: the column fills the plot, 2 of it below the floor.
    expect(Math.round(first.passHeight + first.failHeight)).toBe(100);
    expect(Math.round(first.failHeight)).toBe(20);
    expect(first.failY).toBe(0);
    expect(first.title).toContain('2 would have been blocked');
  });

  it('keeps a scale and a full-width column when a single day is scored', () => {
    const geo = dailyGeometry([{ day: '2026-09-19', passed: 0, failed: 0 }], 300, 100);
    expect(geo.max).toBe(1);
    expect(geo.bars[0].width).toBeCloseTo(210);
    expect(geo.bars[0].passHeight).toBe(0);
  });

  it('routes between the three pages and out to the scored line of code', () => {
    expect(qualityGateRulePath('stale-naming')).toBe('/quality-gate/rules/stale-naming');
    expect(qualityGateHeadPath('jeryu/jeryu-web', 'abc123')).toBe(
      '/quality-gate/heads/jeryu/jeryu-web/abc123'
    );
    expect(repoCodeHref('jeryu/jeryu-web', 'abc123', 'src/a.ts', 12)).toBe(
      '/repos/jeryu/jeryu/jeryu-web/blob/abc123/src/a.ts#L12'
    );
    expect(shortSha('0863f25ab1c2d3e4')).toBe('0863f25a');
  });

  it('says what the window found, including when it found nothing', () => {
    expect(windowSummary(30, 40, 10)).toBe(
      '10 of 40 scored heads scored below the floor in the last 30 days.'
    );
    expect(windowSummary(30, 0, 0)).toBe('No head was scored in the last 30 days.');
  });
});
