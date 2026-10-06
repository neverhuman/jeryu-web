import { describe, expect, it } from 'vitest';

import { ciProgress, usableEstimate } from '../ciProgressModel';

const START = Date.parse('2026-10-06T12:00:00Z');
const at = (seconds: number): number => START + seconds * 1000;
const usual = { typicalSeconds: 600, slowSeconds: 900, samples: 12 };

describe('ciProgress', () => {
  it('gives elapsed time only while there is no estimate', () => {
    const view = ciProgress(START, at(250), null);
    expect(view.phase).toBe('measuring');
    expect(view.fraction).toBeNull();
    expect(view.headline).toBe('4m 10s so far');
    expect(view.detail).toBe('no estimate yet');
  });

  it('counts down in whole minutes, rounded up, inside the usual time', () => {
    const view = ciProgress(START, at(150), usual);
    expect(view.phase).toBe('on-track');
    expect(view.fraction).toBeCloseTo(0.25);
    expect(view.headline).toBe('about 8m left');
    expect(view.detail).toBe('2m 30s so far · usually 10m');
    expect(ciProgress(START, at(570), usual).headline).toBe('under a minute left');
  });

  it('says how far over the usual time a pass is, with a full bar', () => {
    const view = ciProgress(START, at(700), usual);
    expect(view.phase).toBe('over');
    expect(view.fraction).toBe(1);
    expect(view.headline).toBe('2m longer than usual');
  });

  it('calls a pass slow once it is past nearly every recent one', () => {
    const view = ciProgress(START, at(1000), usual);
    expect(view.phase).toBe('slow');
    expect(view.headline).toBe('much slower than usual');
    expect(view.detail).toBe('16m 40s so far · usually 10m, slow ones 15m');
  });

  it('does not call a pass slow seconds after it runs over a tight estimate', () => {
    const tight = { typicalSeconds: 600, slowSeconds: 610, samples: 20 };
    expect(ciProgress(START, at(650), tight).phase).toBe('over');
    expect(ciProgress(START, at(900), tight).phase).toBe('slow');
  });

  it('never shows negative time when the clocks disagree', () => {
    const view = ciProgress(START, at(-30), usual);
    expect(view.elapsedSeconds).toBe(0);
    expect(view.fraction).toBe(0);
  });
});

describe('usableEstimate', () => {
  it('refuses missing, zero and inverted figures', () => {
    expect(usableEstimate(null)).toBeNull();
    expect(usableEstimate({ typicalSeconds: 0, slowSeconds: 10 })).toBeNull();
    expect(usableEstimate({ typicalSeconds: 60, slowSeconds: 30 })).toBeNull();
    expect(usableEstimate({ typicalSeconds: 60, slowSeconds: 90 })).toEqual({
      typicalSeconds: 60,
      slowSeconds: 90,
      samples: 0,
    });
  });
});
