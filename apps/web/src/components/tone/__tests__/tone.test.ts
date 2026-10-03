// tone.test.ts — the tone vocabulary, and the one rule that keeps it honest:
// nothing outside this folder spells the old danger modifier, so red cannot
// creep back onto a row no person has to touch.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { pillClass, scoreTone, toneClass, toneModifier, TONES } from '../tone';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..', '..', '..');

/** Where the modifier may still be written: the helper and its own CSS. */
const ALLOWED = ['src/components/tone/tone.ts', 'src/components/tone/tone.css'];

/** Spelled in two halves so this file is not a hit on its own search. */
const NEEDLE = `${'--'}danger`;

const SOURCE = /\.(ts|tsx|css)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path);
    return SOURCE.test(name) ? [path] : [];
  });
}

describe('tone', () => {
  it('names a class after its tone', () => {
    expect(toneClass('activity-row', 'human')).toBe('activity-row activity-row--human');
    expect(toneModifier('fleet__tone', 'failed')).toBe('fleet__tone--failed');
    expect(pillClass('human')).toBe('page__pill page__pill--human');
    expect(pillClass('failed')).toBe('page__pill page__pill--failed');
    expect(pillClass('unknown')).toBe('page__pill');
    expect(TONES).toEqual(['human', 'failed', 'warn', 'ok', 'unknown']);
  });

  it('reads a score against its floor, and says nothing when there is none', () => {
    expect(scoreTone(85, 85)).toBe('ok');
    expect(scoreTone(71, 85)).toBe('failed');
    expect(scoreTone(null, 85)).toBe('unknown');
    expect(scoreTone(undefined, 85)).toBe('unknown');
  });

  it('is the only place the danger modifier is written', () => {
    const roots = [join(WEB, 'src'), join(WEB, 'e2e')];
    const offenders = roots
      .flatMap(walk)
      .filter((path) => readFileSync(path, 'utf8').includes(NEEDLE))
      .map((path) => relative(WEB, path).split(sep).join('/'))
      .filter((path) => !ALLOWED.includes(path));
    expect(offenders).toEqual([]);
  });
});
