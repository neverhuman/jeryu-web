// incidentModel.test.ts — the Report incident form's checks and the request it builds.

import { describe, expect, it } from 'vitest';

import {
  EMPTY_FORM,
  MAX_CHANGES,
  newIncidentId,
  parseChanges,
  toRequest,
  validate,
} from '../incidents/incidentModel';

describe('incident form model', () => {
  it('needs only a summary', () => {
    expect(validate(EMPTY_FORM).summary).toMatch(/what is wrong/);
    expect(validate({ ...EMPTY_FORM, summary: ' checkout is down ' })).toEqual({});
  });

  it('checks repository, times and change keys before sending', () => {
    const form = {
      ...EMPTY_FORM,
      summary: 's',
      repo: 'not a repo',
      detectedAt: '2026-10-02T10:00',
      restoredAt: '2026-10-02T09:00',
      changes: Array.from({ length: MAX_CHANGES + 1 }, (_, i) => `c${i}`).join('\n'),
    };
    const errors = validate(form);
    expect(errors.repo).toBeDefined();
    expect(errors.restoredAt).toMatch(/before/);
    expect(errors.changes).toMatch(/At most 50/);
    expect(validate({ ...EMPTY_FORM, summary: 's', changes: 'x'.repeat(201) }).changes).toBeDefined();
  });

  it('reads change keys by line or comma, without blanks or repeats', () => {
    expect(parseChanges('a, b\n\n a \nc')).toEqual(['a', 'b', 'c']);
  });

  it('leaves empty fields out and sends times as UTC instants', () => {
    const body = toRequest(
      {
        ...EMPTY_FORM,
        summary: ' down ',
        service: 'checkout',
        detectedAt: '2026-10-02T10:00',
        changes: 'lot-1\nlot-2',
        closed: true,
      },
      'inc-1',
      'acme',
    );
    expect(body).toEqual({
      incident_id: 'inc-1',
      summary: 'down',
      service: 'checkout',
      family: 'acme',
      detected_at: new Date('2026-10-02T10:00').toISOString(),
      changes: ['lot-1', 'lot-2'],
      closed: true,
    });
  });

  it('mints ids the server accepts', () => {
    const id = newIncidentId(new Date('2026-10-02T10:00:00.123Z'), () => 'abcd1234');
    expect(id).toBe('inc-20261002T100000Z-abcd1234');
    expect(newIncidentId()).toMatch(/^[A-Za-z0-9._:-]{1,64}$/);
  });
});
