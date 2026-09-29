import { describe, expect, it } from 'vitest';

import {
  edgeKindLabel,
  endpointLabel,
  formatScore,
  toolBuildSeverity,
} from '../intelligence';

describe('graphHelpers', () => {
  it('keeps the part of a node id that tells two of them apart', () => {
    // Truncating the head left every tool edge reading "tool:jeryu.get_…".
    expect(endpointLabel('tool:jeryu.get_system_snapshot')).toBe(
      '…ryu.get_system_snapshot'
    );
    expect(endpointLabel('tool:jeryu.run_tool_build')).toBe(
      'jeryu.run_tool_build'
    );
    expect(endpointLabel('tool:jeryu.get_tool_manifest')).not.toBe(
      endpointLabel('tool:jeryu.get_system_snapshot')
    );
    expect(endpointLabel('repo:alice/jeryu')).toBe('alice/jeryu');
    expect(endpointLabel('unprefixed-id')).toBe('unprefixed-id');
  });

  it('says edge kinds in words and scores with separators', () => {
    expect(edgeKindLabel('tool_dependency')).toBe('tool dependency');
    expect(formatScore(22_017_846)).toBe('22,017,846');
  });

  it('bands tool-build severity against the worst cluster on screen', () => {
    expect(toolBuildSeverity(100, 100)).toBe('high');
    expect(toolBuildSeverity(50, 100)).toBe('medium');
    expect(toolBuildSeverity(10, 100)).toBe('low');
    // Nothing measured is not "high": a zero top score bands to low.
    expect(toolBuildSeverity(0, 0)).toBe('low');
  });
});
