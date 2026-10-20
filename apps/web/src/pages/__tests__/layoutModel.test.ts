// layoutModel.test.ts — Flow Layout mode's decisions without a browser.

import { describe, expect, it } from 'vitest';

import type { FlowLayoutStation, FlowLayoutTool } from '../../api/types';
import { FLOW_LAYOUT } from '../../../e2e/fixtures/flowHistory';
import { codeWords, layoutCapacityWords, layoutCards, layoutTone, redStations } from '../flow/layoutModel';

const NOW = new Date('2026-10-14T10:05:00Z');
const tool = (over: Partial<FlowLayoutTool> = {}): FlowLayoutTool => ({
  runnerId: 'r1', host: 'h1', online: 'online', load: 'idle', lastSeen: '2026-10-14T10:00:00Z',
  code: { version: '1.0.0', commit: 'abcdef1234' }, ...over,
});
const station = (over: Partial<FlowLayoutStation> = {}): FlowLayoutStation => ({
  id: 'gate', tools: [tool()], ...over,
});

describe('layoutModel', () => {
  it('says the code a runner runs, and when it is not known', () => {
    expect(codeWords(tool())).toBe('1.0.0 (abcdef1)');
    expect(codeWords(tool({ code: { commit: 'abcdef1234' } }))).toBe('abcdef1');
    expect(codeWords(tool({ code: null }))).toBe('code unknown');
  });

  it('compares reporting tools with the expected capacity, never inventing one', () => {
    expect(layoutCapacityWords(station({ capacity: { reporting: 2, busy: 1, expected: 4 } }))).toBe('2 of 4 expected reporting');
    expect(layoutCapacityWords(station({ capacity: { reporting: 1, busy: 0, expected: null } }))).toBe('1 reporting, expected capacity not set');
    // A server that sends no capacity: counted from the tools that are online.
    expect(layoutCapacityWords(station({ tools: [tool(), tool({ online: 'offline' })] }))).toBe('1 reporting, expected capacity not set');
  });

  it('is red with no reporting tool or fewer than expected, orange for a failing tool', () => {
    expect(layoutTone(station({ tools: [] }))).toBe('human');
    expect(layoutTone(station({ tools: [tool({ online: 'offline' })] }))).toBe('human');
    expect(layoutTone(station({ capacity: { reporting: 1, busy: 0, expected: 2 } }))).toBe('human');
    expect(layoutTone(station({ capacity: { reporting: 2, busy: 0, expected: 2 } }))).toBe('ok');
    expect(layoutTone(station({ warnings: ['tool_failing'] }))).toBe('failed');
    expect(layoutTone(station())).toBe('ok');
  });

  it('lays cards out in route order with the live report absent', () => {
    const cards = layoutCards(FLOW_LAYOUT as never, undefined, NOW);
    expect(cards.map((card) => card.id)).toEqual(['queue', 'review', 'gate', 'merge']);
    expect(redStations(cards).map((card) => card.label)).toEqual(['Gate', 'Merge']);
    const gate = cards.find((card) => card.id === 'gate')!;
    expect(gate.tools.map((row) => row.state)).toEqual(['online · idle', 'online · busy', 'offline · idle']);
    expect(gate.tools[0]!.lastSeen).toBe('5 min ago');
  });
});
