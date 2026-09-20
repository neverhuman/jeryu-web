// dependencyGraph.test.ts - the depth layout and the pin colouring behind it.

import { describe, expect, it } from 'vitest';

import { endpoints } from '../../api/endpoints';
import type { GraphEdge, RepoGraphResponse } from '../../api/types';
import {
  buildDependencyGraph,
  dependencyDepths,
} from '../intelligenceGraphModel';
import {
  edgePinFreshness,
  pinFreshnessLabel,
} from '../intelligence/graphHelpers';

describe('dependency graph', () => {
  it('asks the repo graph for the depends_on edge kind', () => {
    expect(endpoints.controlPlaneRepoGraph()).toBe(
      '/api/v1/control-plane/repo-graph'
    );
    expect(endpoints.controlPlaneRepoGraph({ include: ['depends_on'] })).toBe(
      '/api/v1/control-plane/repo-graph?include=depends_on'
    );
  });

  it('keeps only depends_on edges and the repos they connect', () => {
    const graph = buildDependencyGraph(
      response(),
      { kinds: [], states: [], query: '' },
      null
    );

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'repo:jeryu/core',
      'repo:jeryu/deploy',
      'repo:jeryu/web',
    ]);
    expect(graph.edges.every((edge) => edge.kind === 'depends_on')).toBe(true);
    expect(graph.clusters).toEqual([]);
  });

  it('lays repos out by dependency depth, not by kind', () => {
    const graph = buildDependencyGraph(
      response(),
      { kinds: [], states: [], query: '' },
      'repo:jeryu/core'
    );
    const depths = new Map(graph.nodes.map((node) => [node.id, node.depth]));

    expect(depths.get('repo:jeryu/web')).toBe(0);
    expect(depths.get('repo:jeryu/deploy')).toBe(1);
    expect(depths.get('repo:jeryu/core')).toBe(2);
    const xs = new Map(graph.nodes.map((node) => [node.id, node.x]));
    expect(xs.get('repo:jeryu/core')).toBeGreaterThan(
      xs.get('repo:jeryu/web') ?? 0
    );
    expect(graph.selected?.inbound.map((edge) => edge.source)).toEqual([
      'repo:jeryu/deploy',
    ]);
  });

  it('settles depths on a dependency cycle instead of deepening forever', () => {
    const nodes = [node('repo:a'), node('repo:b')];
    const depths = dependencyDepths(nodes, [
      dependsOn('repo:a', 'repo:b', {}),
      dependsOn('repo:b', 'repo:a', {}),
    ]);

    expect(depths.get('repo:a')).toBeLessThanOrEqual(nodes.length);
    expect(depths.get('repo:b')).toBeLessThanOrEqual(nodes.length);
  });

  it('colours an edge by the pin behind it, and invents nothing without one', () => {
    expect(edgePinFreshness(dependsOn('a', 'b', { pinState: 'current' }))).toBe(
      'current'
    );
    expect(
      edgePinFreshness(dependsOn('a', 'b', { pinState: 'behind_not_green' }))
    ).toBe('behind');
    expect(edgePinFreshness(dependsOn('a', 'b', { pinState: 'diverged' }))).toBe(
      'diverged'
    );
    expect(edgePinFreshness(dependsOn('a', 'b', { behind: '3' }))).toBe('behind');
    expect(edgePinFreshness(dependsOn('a', 'b', { behind: '0' }))).toBe('current');
    expect(edgePinFreshness(dependsOn('a', 'b', {}))).toBe('unknown');

    expect(
      pinFreshnessLabel(dependsOn('a', 'b', { pinState: 'behind', behind: '1' }))
    ).toBe('1 commit behind');
    expect(pinFreshnessLabel(dependsOn('a', 'b', {}))).toBe('pin not compared');
  });

  it('filters by query without dropping the edges between what is left', () => {
    const graph = buildDependencyGraph(
      response(),
      { kinds: [], states: [], query: 'deploy' },
      null
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(['repo:jeryu/deploy']);
    expect(graph.edges).toEqual([]);
  });

  it('is empty, not broken, before the graph arrives', () => {
    const graph = buildDependencyGraph(
      null,
      { kinds: [], states: [], query: '' },
      null
    );
    expect(graph.nodes).toEqual([]);
    expect(graph.selected).toBeNull();
  });
});

function node(id: string): RepoGraphResponse['nodes'][number] {
  return {
    id,
    label: id.replace('repo:', ''),
    kind: 'repo',
    state: 'fresh',
    weight: 1,
    metadata: {},
  };
}

function dependsOn(
  source: string,
  target: string,
  metadata: Record<string, string>
): GraphEdge {
  return {
    source,
    target,
    kind: 'depends_on',
    state: 'fresh',
    weight: 1,
    metadata,
  };
}

function response(): RepoGraphResponse {
  return {
    schemaVersion: 'jeryu.repo_graph/v2',
    generatedAt: '2026-09-19T00:00:00Z',
    nodes: [
      node('repo:jeryu/core'),
      node('repo:jeryu/deploy'),
      node('repo:jeryu/web'),
      node('repo:jeryu/docs'),
    ],
    edges: [
      dependsOn('repo:jeryu/web', 'repo:jeryu/deploy', {
        pinState: 'current',
        behind: '0',
      }),
      dependsOn('repo:jeryu/deploy', 'repo:jeryu/core', {
        pinState: 'behind',
        behind: '4',
      }),
      {
        source: 'repo:jeryu/web',
        target: 'repo:jeryu/docs',
        kind: 'owns_pr',
        state: 'fresh',
        weight: 1,
      },
    ],
    clusters: [],
    insights: [],
  };
}
