// yieldModel.test.ts — the Yield page's decisions without a browser: the
// controls read from the address, the window's dates, money and rates in
// words, the KPI row, the funnel, the weekly trend and the todo lists.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BY,
  DEFAULT_WINDOW_DAYS,
  armLabel,
  armShare,
  formatCi,
  formatRate,
  formatUsd,
  groupLabel,
  niceCeiling,
  outcomeSegments,
  parseBy,
  parseWindow,
  priceSourcesNote,
  sourceSegments,
  spendSummary,
  todoRefMeta,
  todoRefStatus,
  trendData,
  trendGeometry,
  trendSummary,
  windowDates,
  yieldKpis,
} from '../yield/yieldModel';
import { REPORT, TOTALS, row } from './yieldTestData';

describe('controls in the address', () => {
  it('reads a known window and cut, and falls back on anything else', () => {
    expect(parseWindow(new URLSearchParams('days=7'))).toBe(7);
    expect(parseWindow(new URLSearchParams('days=90'))).toBe(90);
    expect(parseWindow(new URLSearchParams('days=13'))).toBe(DEFAULT_WINDOW_DAYS);
    expect(parseWindow(new URLSearchParams(''))).toBe(28);
    expect(parseBy(new URLSearchParams('by=experiment'))).toBe('experiment');
    expect(parseBy(new URLSearchParams('by=weather'))).toBe(DEFAULT_BY);
    expect(DEFAULT_BY).toBe('model');
  });

  it('ends the window today (UTC) and starts it that many days before', () => {
    const now = new Date('2026-10-09T23:30:00Z');
    expect(windowDates(28, now)).toEqual({ since: '2026-09-11', until: '2026-10-09' });
    expect(windowDates(7, now)).toEqual({ since: '2026-10-02', until: '2026-10-09' });
    expect(windowDates(90, new Date('2026-03-01T00:10:00Z'))).toEqual({
      since: '2025-12-01',
      until: '2026-03-01',
    });
  });
});

describe('money and rates', () => {
  it('shows cents under a hundred dollars and whole dollars above, grouped', () => {
    expect(formatUsd(4.167)).toBe('$4.17');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(1234.6)).toBe('$1,235');
    expect(formatUsd(-2.5)).toBe('-$2.50');
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(Number.NaN)).toBe('—');
  });

  it('shows rates in whole percent and an undefined rate with a dash', () => {
    expect(formatRate(0.833)).toBe('83%');
    expect(formatRate(1)).toBe('100%');
    expect(formatRate(null)).toBe('—');
  });

  it('writes an interval, never below zero, and nothing without one', () => {
    expect(formatCi([3.9, 6.1])).toBe('$3.90–$6.10');
    expect(formatCi([-1, 2])).toBe('$0.00–$2.00');
    expect(formatCi(null)).toBeNull();
  });
});

describe('yieldKpis', () => {
  it('puts cost per merged change first, with its range and count', () => {
    const kpis = yieldKpis(TOTALS);
    expect(kpis.map((kpi) => kpi.id)).toEqual([
      'per-merged',
      'yield',
      'first-pass',
      'review-share',
      'waste',
    ]);
    expect(kpis[0]).toMatchObject({
      label: 'Cost per merged change',
      value: '$5.00',
      detail: '95% range $3.90–$6.10 · 30 merged changes',
    });
    expect(kpis[1]).toMatchObject({ value: '83%', detail: expect.stringContaining('$150 of $180') });
    expect(kpis[2]).toMatchObject({ value: '70%', detail: '21 of 30 merged changes needed one attempt' });
    expect(kpis[3]).toMatchObject({ value: '20%', detail: '$40.00 of $200 went to review' });
    expect(kpis[4]).toMatchObject({ value: '$12.50', detail: '$8.00 of spend priced from transcripts' });
  });

  it('says why there is no range, and dashes what nothing defines', () => {
    const kpis = yieldKpis(row({ merged: 1, usd_per_merged: 9 }));
    expect(kpis[0].detail).toBe('1 merged change · no range under two');
    const empty = yieldKpis(row());
    expect(empty[0].value).toBe('—');
    expect(empty[1].value).toBe('—');
    expect(empty[3].value).toBe('—');
  });
});

describe('funnel', () => {
  it('splits spend by outcome, in order, each segment after the last', () => {
    const segments = outcomeSegments(TOTALS);
    expect(segments.map((s) => [s.key, s.usd])).toEqual([
      ['main', 150],
      ['pending', 20],
      ['scrap', 30],
    ]);
    expect(segments[0]).toMatchObject({ fraction: 0.75, offset: 0 });
    expect(segments[1]).toMatchObject({ fraction: 0.1, offset: 0.75 });
    expect(segments[2].offset).toBeCloseTo(0.85);
  });

  it('splits spend by work, and draws nothing over nothing', () => {
    expect(sourceSegments(TOTALS).map((s) => s.fraction)).toEqual([0.75, 0.2, 0.05]);
    expect(sourceSegments(row()).every((s) => s.fraction === 0)).toBe(true);
  });

  it('says the window in one sentence', () => {
    expect(spendSummary(TOTALS, 28)).toBe(
      '$200 spent on 40 todos over 58 attempts in the last 28 days; 30 changes reached main.'
    );
    expect(spendSummary(row({ todos: 1, attempts: 1, merged: 1, spend_usd: 2 }), 7)).toBe(
      '$2.00 spent on 1 todo over 1 attempt in the last 7 days; 1 change reached main.'
    );
  });
});

describe('weekly trend', () => {
  it('draws one line per group over the same weeks, in the table order', () => {
    const data = trendData(REPORT.weekly, ['model-b', 'model-a']);
    expect(data.weeks).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
    expect(data.series.map((s) => s.group)).toEqual(['model-b', 'model-a']);
    // A week the group merged nothing in has no point.
    expect(data.series[0].points[0].usdPerMerged).toBeNull();
    expect(data.series[1].points[1]).toMatchObject({ usdPerMerged: 5, merged: 8, mainUsd: 40 });
    expect(data.omitted).toBe(0);
  });

  it('keeps the chart to a few lines and counts the rest', () => {
    const weekly = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map((group) => ({
      week: '2026-09-28',
      group,
      merged: 1,
      main_usd: 1,
      usd_per_merged: 1,
    }));
    const data = trendData(weekly, ['g6', 'g5']);
    expect(data.series.map((s) => s.group)).toEqual(['g6', 'g5', 'g1', 'g2']);
    expect(data.omitted).toBe(2);
  });

  it('rounds the scale up to a readable value', () => {
    expect(niceCeiling(6)).toBe(10);
    expect(niceCeiling(1.3)).toBe(2);
    expect(niceCeiling(42)).toBe(50);
    expect(niceCeiling(0)).toBe(1);
  });

  it('breaks a line where a week has no point, and titles every dot', () => {
    const data = trendData(REPORT.weekly, ['model-a', 'model-b']);
    const geo = trendGeometry(data, 200, 100);
    expect(geo.max).toBe(10);
    expect(geo.ticks.map((t) => t.x)).toEqual([0, 100, 200]);
    const [a, b] = geo.lines;
    expect(a.path).toBe('M0.0 40.0 L100.0 50.0 L200.0 57.1');
    // model-b merged nothing in its first week: its line starts at the second.
    expect(b.path.startsWith('M100.0 40.0')).toBe(true);
    expect(b.dots).toHaveLength(2);
    expect(a.dots[1].title).toBe(
      'model-a, week of 2026-09-21: $5.00 per merged change (8 merged, $40.00 reached main)'
    );
  });

  it('puts a single week in the middle', () => {
    const data = trendData([REPORT.weekly[0]], ['model-a']);
    expect(trendGeometry(data, 200, 100).ticks).toEqual([{ week: '2026-09-14', x: 100 }]);
  });

  it('speaks the span and the latest value of each line', () => {
    const data = trendData(REPORT.weekly, ['model-a', 'model-b']);
    expect(trendSummary(data)).toBe(
      'Cost per merged change by week, 2026-09-14 to 2026-09-28: latest model-a $4.29 in the week of 2026-09-28; model-b $4.33 in the week of 2026-09-28.'
    );
    expect(trendSummary(trendData([], []))).toBe(
      'Cost per merged change by week: no weeks in this window.'
    );
  });
});

describe('labels', () => {
  it('names weeks, arms and todos the way the tables say them', () => {
    expect(groupLabel('week', '2026-09-28')).toBe('Week of 2026-09-28');
    expect(groupLabel('model', 'model-a')).toBe('model-a');
    expect(armLabel({ agent: 'codex', model: 'model-b' })).toBe('codex · model-b');
    expect(armShare({ arm_p: 0.25 })).toBe('25%');
    expect(armShare({ arm_p: null })).toBe('—');
    expect(todoRefMeta(REPORT.costliest[0])).toBe('acme · 3 attempts · claude · model-a');
    expect(todoRefMeta({ ...REPORT.costliest[0], agent: null, model: null, attempts: 1 })).toBe(
      'acme · 1 attempt'
    );
  });

  it('colours where a costly todo stands: blocked is red, it can still be saved', () => {
    const ref = REPORT.costliest[0];
    expect(todoRefStatus({ ...ref, status: 'blocked', merged: false })).toMatchObject({
      label: 'blocked',
      tone: 'human',
    });
    expect(todoRefStatus({ ...ref, status: 'blocked', merged: false }).hint).toContain('unblock');
    expect(todoRefStatus({ ...ref, status: 'handoff', merged: false }).tone).toBe('human');
    expect(todoRefStatus({ ...ref, status: 'done', merged: true })).toMatchObject({ label: 'merged', tone: 'ok' });
    expect(todoRefStatus({ ...ref, status: 'done', merged: false })).toMatchObject({
      label: 'in review',
      tone: 'warn',
    });
    expect(todoRefStatus({ ...ref, status: 'open', merged: false })).toMatchObject({ label: 'open', tone: 'warn' });
    expect(todoRefStatus({ ...ref, status: 'claimed', merged: false }).tone).toBe('warn');
    expect(todoRefStatus({ ...ref, status: 'closed', merged: false }).tone).toBe('unknown');
  });

  it('names the price sources, or says none were named', () => {
    expect(priceSourcesNote(['catalog@0000001', 'config'])).toContain(
      'Token prices: catalog@0000001, config.'
    );
    expect(priceSourcesNote([])).toContain('no usage record named a price source');
  });
});
