// The one time formatter, read against a frozen clock.
//
// The suite's zone is America/New_York (see vitest.config.ts), so these cases
// also prove the reader's zone — not UTC — is what a clock time shows.

import { describe, expect, it } from 'vitest';

import {
  absoluteText,
  clockText,
  compareInstants,
  dateText,
  instantOf,
  localDayKey,
  relativeText,
  rfc3339Seconds,
  shiftDayKey,
  stampText,
  tickText,
  utcDayKey,
  zoneLabel,
} from '../when';

const NOW = new Date('2026-09-19T14:00:00Z');

describe('instantOf', () => {
  it('reads every form the API emits, and nothing else', () => {
    expect(instantOf('2026-09-19T14:00:00Z')).toBe(NOW.getTime());
    expect(instantOf('2026-09-19T14:00:00+00:00')).toBe(NOW.getTime());
    expect(instantOf(NOW)).toBe(NOW.getTime());
    expect(instantOf(NOW.getTime())).toBe(NOW.getTime());
    expect(instantOf(null)).toBeNull();
    expect(instantOf(undefined)).toBeNull();
    expect(instantOf('')).toBeNull();
    expect(instantOf('nonsense')).toBeNull();
  });
});

describe('compareInstants', () => {
  it('orders by instant across mixed Z and +00:00 stamps', () => {
    const stamps = [
      '2026-09-19T13:00:00+00:00',
      '2026-09-19T09:30:00Z',
      '2026-09-19T11:00:00+02:00', // 09:00 UTC: the earliest of the four
      '2026-09-19T12:00:00Z',
    ];
    expect([...stamps].sort(compareInstants)).toEqual([
      '2026-09-19T11:00:00+02:00',
      '2026-09-19T09:30:00Z',
      '2026-09-19T12:00:00Z',
      '2026-09-19T13:00:00+00:00',
    ]);
    // Text order would have put 09:30Z first and 11:00+02:00 third.
    expect([...stamps].sort()).not.toEqual([...stamps].sort(compareInstants));
  });

  it('calls the same instant a tie and sorts what it cannot read last', () => {
    expect(compareInstants('2026-09-19T14:00:00Z', '2026-09-19T14:00:00+00:00')).toBe(0);
    expect(compareInstants(null, '2026-09-19T14:00:00Z')).toBeGreaterThan(0);
    expect(compareInstants('2026-09-19T14:00:00Z', 'nonsense')).toBeLessThan(0);
    expect(compareInstants(null, undefined)).toBe(0);
  });
});

describe('relativeText', () => {
  it('words a gap one way, in both directions', () => {
    expect(relativeText('2026-09-19T13:59:50Z', NOW)).toBe('just now');
    expect(relativeText('2026-09-19T13:48:00Z', NOW)).toBe('12 min ago');
    expect(relativeText('2026-09-19T11:00:00Z', NOW)).toBe('3 h ago');
    expect(relativeText('2026-09-17T14:00:00Z', NOW)).toBe('2 days ago');
    expect(relativeText('2026-09-18T14:00:00Z', NOW)).toBe('1 day ago');
    expect(relativeText('2026-05-22T14:00:00Z', NOW)).toBe('4 months ago');
    expect(relativeText('2026-09-19T14:14:00Z', NOW)).toBe('in 14 min');
    expect(relativeText('2026-09-19T15:00:00Z', NOW)).toBe('in 1 h');
  });

  it('reads the same off a +00:00 stamp as off a Z one', () => {
    expect(relativeText('2026-09-19T13:48:00+00:00', NOW)).toBe(
      relativeText('2026-09-19T13:48:00Z', NOW)
    );
  });

  it('says what arrived when it cannot read it, and an em dash for nothing', () => {
    expect(relativeText('nonsense', NOW)).toBe('nonsense');
    expect(relativeText(null, NOW)).toBe('—');
    expect(relativeText(undefined, NOW)).toBe('—');
  });
});

describe('absolute wordings', () => {
  it('names the zone, so a relative label is never the whole story', () => {
    const absolute = absoluteText('2026-09-19T13:03:26Z');
    expect(absolute).toContain('Sep 19, 2026');
    expect(absolute).toContain('9:03:26');
    expect(absolute).toContain(zoneLabel());
    expect(zoneLabel()).toBe('EDT');
  });

  it("shows the clock, the date and a chart tick in the reader's zone", () => {
    expect(clockText('2026-09-19T13:03:26Z')).toBe('09:03:26');
    expect(dateText('2026-09-19T13:03:26Z')).toBe('Sep 19, 2026');
    expect(tickText(new Date('2026-09-19T13:03:26Z'), 12)).toBe('09:03');
    expect(tickText(new Date('2026-09-19T13:03:26Z'), 72)).toBe('Sep 19');
    expect(stampText('2026-09-19T13:03:26Z')).toContain('Sep 19');
  });

  it('keeps day keys and API stamps machine-readable', () => {
    // 01:30 UTC on the 20th is still the 19th, late, for the reader.
    expect(utcDayKey('2026-09-20T01:30:00Z')).toBe('2026-09-20');
    expect(localDayKey('2026-09-20T01:30:00Z')).toBe('2026-09-19');
    expect(shiftDayKey('2026-09-19', 1)).toBe('2026-09-20');
    expect(shiftDayKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(rfc3339Seconds('2026-09-19T13:03:26.481Z')).toBe('2026-09-19T13:03:26Z');
    expect(rfc3339Seconds('nonsense')).toBeNull();
    expect(utcDayKey('nonsense')).toBe('');
  });
});
