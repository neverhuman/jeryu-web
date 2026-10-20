// lotEtaModel.test.ts — which lot a page is about and its estimate in words.

import { describe, expect, it } from 'vitest';

import { findLot, lotEtaView } from '../../components/flow/lotEtaModel';
import { FLOW_REPORT } from './flowTestData';

describe('lotEtaModel', () => {
  it('finds a lot by its todo, by its pull request id, or by its pull request page', () => {
    expect(findLot(FLOW_REPORT, { todoIds: ['acme-0001'] })?.lot_id).toBe('acme-0001');
    expect(findLot(FLOW_REPORT, { pull: { repo: 'acme/widgets', number: 42 } })?.lot_id).toBe('acme/widgets#42');
    expect(findLot(FLOW_REPORT, { todoIds: ['nope'], pull: { repo: 'acme/widgets', number: 43 } })?.lot_id).toBe('acme/widgets#43');
    // The same number in another repository is another pull request.
    expect(findLot(FLOW_REPORT, { pull: { repo: 'other/widgets', number: 43 } })).toBeNull();
    expect(findLot(FLOW_REPORT, { pull: { repo: 'acme/widgets', number: 999 } })).toBeNull();
    expect(findLot(FLOW_REPORT, {})).toBeNull();
  });

  it('says p50, the p90 bound and the slowest station ahead', () => {
    const view = lotEtaView(FLOW_REPORT, findLot(FLOW_REPORT, { todoIds: ['acme-0001'] })!);
    expect(view.text).toBe('ETA 30m (p90 bound 1h 30m)');
    expect(view.slowest).toBe('Gate');
    expect(view.stationLabel).toBe('Gate');
  });

  it('says what an estimate leaves out, and that a held lot has none', () => {
    const partial = lotEtaView(FLOW_REPORT, findLot(FLOW_REPORT, { pull: { repo: 'acme/widgets', number: 42 } })!);
    expect(partial.text).toBe('ETA 40m (p90 bound 2h), not counting Pin');
    const held = lotEtaView(FLOW_REPORT, findLot(FLOW_REPORT, { todoIds: ['acme-0003'] })!);
    expect(held.text).toBe('held — a person is the next step');
    expect(held.slowest).toBeNull();
  });
});
