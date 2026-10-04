// qualityGateModel.test.ts — the arithmetic behind the Quality gate pages.

import { describe, expect, it } from 'vitest';

import {
  countsLatestHeads,
  dailyGeometry,
  formatScore,
  percent,
  qualityGateHeadPath,
  qualityGateRulePath,
  repoCodeHref,
  ruleFindings,
  ruleRepos,
  shortSha,
  sortDimensions,
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
    const quiet = OVERVIEW.rules.map((rule) => ({ ...rule, failures: 0, latest_findings: 0 }));
    expect(topFailingRule(quiet)).toBeUndefined();
  });

  it('ranks rules by what is open on the latest heads, not by every push', () => {
    const rules = [
      { ...OVERVIEW.rules[0], rule: 'repeated', failures: 90, latest_findings: 1, latest_repos: 1 },
      { ...OVERVIEW.rules[0], rule: 'spread', failures: 10, latest_findings: 8, latest_repos: 6 },
    ];
    expect(sortRules(rules).map((rule) => rule.rule)).toEqual(['spread', 'repeated']);
    expect(topFailingRule(rules)?.rule).toBe('spread');
    expect(ruleFindings(rules[0])).toBe(1);
    expect(ruleRepos(rules[1])).toBe(6);
    expect(countsLatestHeads(rules)).toBe(true);
  });

  it('falls back to the per-head totals from a server without latest counts', () => {
    const { rule, title, failures, repos, disputes, dispute_rate } = OVERVIEW.rules[1];
    const older = { rule, title, failures, repos, disputes, dispute_rate };
    expect(ruleFindings(older)).toBe(12);
    expect(ruleRepos(older)).toBe(3);
    expect(countsLatestHeads([older])).toBe(false);
  });

  it('orders dimensions by reach, then lowest median', () => {
    const dimensions = [
      { dimension: 'Proof lanes', repos: 2, median_score: 40, floor: 85, attributed_rule: null },
      { dimension: 'Build speed', repos: 5, median_score: 70, floor: 85, attributed_rule: null },
      { dimension: 'Code shape', repos: 2, median_score: 20, floor: 85, attributed_rule: null },
    ];
    expect(sortDimensions(dimensions).map((d) => d.dimension)).toEqual([
      'Build speed',
      'Code shape',
      'Proof lanes',
    ]);
    expect(formatScore(62.5)).toBe('62.5');
    expect(formatScore(70)).toBe('70');
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
    expect(repoCodeHref('forge.example', 'jeryu/jeryu-web', 'abc123', 'src/a.ts', 12)).toBe(
      '/repos/forge.example/jeryu/jeryu-web/blob/abc123/src/a.ts#L12'
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
