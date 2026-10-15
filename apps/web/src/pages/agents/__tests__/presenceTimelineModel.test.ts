import { describe, expect, it } from 'vitest';

import { spanOf, timelineBar, timelineTicks, timelineWindow } from '../presenceTimelineModel';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 15, 18, 30);
const day = timelineWindow('24h', NOW);

describe('presence timeline', () => {
  it('defaults to 24 hours and reads only known spans', () => {
    expect(spanOf(null)).toBe('24h');
    expect(spanOf('7d')).toBe('7d');
    expect(spanOf('1y')).toBe('24h');
    expect(day.end - day.start).toBe(24 * H);
  });

  it('puts ticks inside the window in order', () => {
    const ticks = timelineTicks(day);
    expect(ticks).toHaveLength(8);
    for (const tick of ticks) {
      expect(tick.offset).toBeGreaterThan(0);
      expect(tick.offset).toBeLessThan(1);
    }
    expect(ticks.map((tick) => tick.at)).toEqual([...ticks.map((tick) => tick.at)].sort((a, b) => a - b));
  });

  it('runs an active agent from first seen to now', () => {
    const bar = timelineBar({ state: 'active', started_at: NOW - 6 * H, last_active_at: NOW - 60_000 }, day, NOW);
    expect(bar?.left).toBeCloseTo(0.75);
    expect(bar?.width).toBeCloseTo(0.25);
    expect(bar?.tail).toBe('running');
    expect(bar?.tailWidth).toBe(0);
    expect(bar?.summary).toMatch(/working now/);
  });

  it('trails an idle agent from its last activity to now', () => {
    const bar = timelineBar({ state: 'idle', started_at: NOW - 12 * H, last_active_at: NOW - 6 * H }, day, NOW);
    expect(bar?.left).toBeCloseTo(0.5);
    expect(bar?.width).toBeCloseTo(0.25);
    expect(bar?.tailWidth).toBeCloseTo(0.25);
    expect(bar?.tail).toBe('idle');
  });

  it('stops an ended agent at its finish', () => {
    const bar = timelineBar({ state: 'ended', started_at: NOW - 20 * H, last_active_at: NOW - 14 * H }, day, NOW);
    expect(bar?.ended).toBe(true);
    expect(bar?.width).toBeCloseTo(0.25);
    expect(bar?.tailWidth).toBe(0);
    expect(bar?.summary).toMatch(/finished/);
  });

  it('clips an agent first seen before the window', () => {
    const bar = timelineBar({ state: 'active', started_at: NOW - 30 * H, last_active_at: NOW }, day, NOW);
    expect(bar?.clippedStart).toBe(true);
    expect(bar?.left).toBe(0);
    expect(bar?.width).toBeCloseTo(1);
  });

  it('draws nothing for an agent outside the window or without times', () => {
    expect(timelineBar({ state: 'ended', started_at: NOW - 40 * H, last_active_at: NOW - 30 * H }, day, NOW)).toBeNull();
    expect(timelineBar({ state: 'active', started_at: null, last_active_at: null }, day, NOW)).toBeNull();
  });

  it('uses the last activity when the start was never reported', () => {
    const bar = timelineBar({ state: 'stale', started_at: null, last_active_at: NOW - 2 * H }, day, NOW);
    expect(bar?.left).toBeCloseTo(22 / 24);
    expect(bar?.tail).toBe('none');
  });
});
