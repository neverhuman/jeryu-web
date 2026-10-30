import { describe, expect, it } from 'vitest';
import { LINEAGE } from '../../test/fixtures/delivery';
import { graphLayout } from './model';
describe('actual commit ancestry', () => {
  it('keeps shared commits on one rail and preserves both parents of a merge', () => {
    const layout = graphLayout(LINEAGE);
    expect(layout.lane.get(LINEAGE.default_sha)).toBe(0);
    expect(layout.lane.size).toBe(LINEAGE.commits.length);
    const edges = layout.edges.filter(edge => edge.child === LINEAGE.branches[0].sha);
    expect(edges.map(edge => edge.parent)).toEqual(LINEAGE.commits[0].parents);
    expect(layout.edges.some(edge => edge.parent === LINEAGE.branches[0].sha)).toBe(false);
  });
  it('marks ancestry outside the loaded window without inventing a root', () => {
    const edges = graphLayout(LINEAGE).edges;
    expect(edges.filter(edge => edge.to === null).map(edge => edge.parent)).toEqual(LINEAGE.missing_parents);
  });
});
