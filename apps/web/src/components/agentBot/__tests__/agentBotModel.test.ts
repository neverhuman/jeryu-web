import { describe, expect, it } from 'vitest';

import {
  archetypeOf,
  ARCHETYPES,
  botOfPresence,
  hash,
  knownHarness,
  paletteOf,
  signatureOf,
  traitsOf,
  type BotAgent,
} from '../agentBotModel';

const bot = (id: string, harness = 'claude-code'): BotAgent => ({ id, harness, type: 'worker', status: 'working' });

describe('agent bot model', () => {
  it('gives the same traits for the same id and new ones for a new variant', () => {
    expect(traitsOf({ id: 'external:a' })).toEqual(traitsOf({ id: 'external:a', variant: 0 }));
    expect(traitsOf({ id: 'external:a' })).not.toEqual(traitsOf({ id: 'external:a', variant: 1 }));
  });

  it('keeps every trait inside its range', () => {
    for (let i = 0; i < 200; i++) {
      const t = traitsOf({ id: `agent-${i}` });
      expect(t.visor).toBeLessThan(4);
      expect(t.eyes).toBeLessThan(5);
      expect(t.mouth).toBeLessThan(3);
      expect(t.antenna).toBeLessThan(5);
      expect(t.ear).toBeLessThan(3);
      expect(t.mark).toBeLessThan(5);
      expect(t.decal).toBeLessThan(3);
      expect(t.acc).toBeLessThan(4);
      expect(t.limbs).toBeLessThan(2);
      expect(t.pose).toBeLessThan(4);
      expect([-5, 0, 5]).toContain(t.look);
      expect(t.delay).toBeGreaterThanOrEqual(0);
      expect(t.delay).toBeLessThan(4);
    }
  });

  it('draws a fleet of distinct bots', () => {
    const looks = new Set(Array.from({ length: 200 }, (_, i) => signatureOf(bot(`agent-${i}`))));
    expect(looks.size).toBeGreaterThan(195);
  });

  it('maps reported harness names onto the five archetypes', () => {
    expect(knownHarness('claude-code')).toBe('Claude');
    expect(knownHarness('Codex')).toBe('Codex');
    expect(knownHarness('gemini-cli')).toBe('Gemini');
    expect(knownHarness('cursor')).toBeNull();
    expect(archetypeOf('claude-code')).toBe(ARCHETYPES.Claude);
    expect(archetypeOf('codex').loco).toBe('treads');
  });

  it('never resolves a harness name through the prototype chain', () => {
    // The harness is free-form remote data; these must hash like any other name.
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(knownHarness(name)).toBeNull();
      expect(Object.values(ARCHETYPES)).toContain(archetypeOf(name));
      expect(paletteOf(name).known).toBe(false);
    }
  });

  it('gives an unknown harness a stable look of its own', () => {
    expect(archetypeOf('cursor')).toBe(archetypeOf('cursor'));
    expect(paletteOf('cursor')).toEqual(paletteOf('cursor'));
    expect(paletteOf('cursor').known).toBe(false);
    expect(paletteOf('cursor').hue).toBe(hash('brand:cursor') % 360);
  });

  it('uses brand colors for known brands, shared by GPT and Codex', () => {
    expect(paletteOf('claude-code').hue).toBe(15);
    expect(paletteOf('codex').accent).toBe(paletteOf('gpt').accent);
    expect(paletteOf('gemini').hue).toBe(222);
    expect(paletteOf('agy').known).toBe(false);
  });

  it('reads gear from the source and motion from the presence state', () => {
    expect(botOfPresence({ id: 'x', agent: 'codex', source: 'external', state: 'active' })).toEqual({
      id: 'x', harness: 'codex', type: 'adhoc', status: 'working',
    });
    expect(botOfPresence({ id: 'x', agent: 'codex', source: 'queue_worker', state: 'idle' }).type).toBe('worker');
    expect(botOfPresence({ id: 'x', agent: 'codex', source: 'gate', state: 'stale' }).status).toBe('idle');
    expect(botOfPresence({ id: 'x', agent: 'codex', source: 'reviewer', state: 'ended' }).status).toBe('done');
  });
});
