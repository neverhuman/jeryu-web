import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GraphEdge, ToolBuildCluster } from '../../api/types';
import { EdgeList, ToolBuildDossiers } from '../intelligence';

describe('EdgeList', () => {
  it('shows which tools an edge joins instead of the same truncated string', () => {
    render(<EdgeList edges={toolEdges(14)} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(12);
    const texts = rows.map((row) => row.textContent);
    expect(new Set(texts).size).toBe(texts.length);
    expect(within(rows[0]).getByText('tool dependency')).toBeInTheDocument();
    expect(within(rows[0]).getByText('jeryu.get_source_0')).toBeInTheDocument();
    expect(within(rows[0]).getByText('jeryu.run_target_0')).toBeInTheDocument();
    // The full id stays reachable for the operator who needs it.
    expect(within(rows[0]).getByTitle('tool:jeryu.get_source_0')).toBeInTheDocument();
    // And the list says what it is not showing.
    expect(screen.getByText(/Showing 12 of 14 edges/)).toBeInTheDocument();
  });

  it('says nothing about hidden edges when it shows them all', () => {
    render(<EdgeList edges={toolEdges(3)} />);
    expect(screen.queryByText(/Showing/)).toBeNull();
  });
});

describe('ToolBuildDossiers', () => {
  it('labels the score, bands severity, and keeps developer commands off the page', () => {
    render(
      <ToolBuildDossiers
        clusters={[
          toolCluster('tb-worst', 22_017_846),
          toolCluster('tb-least', 900_000),
        ]}
        summaryClusters={[]}
        unavailable={null}
      />
    );

    const dossiers = screen.getByTestId('tool-build-dossiers');
    // No bare unlabelled number leading the card.
    expect(within(dossiers).getByText('score 22,017,846')).toBeInTheDocument();
    expect(within(dossiers).queryByText('22017846')).toBeNull();
    expect(within(dossiers).getByText('high')).toBeInTheDocument();
    expect(within(dossiers).getByText('low')).toBeInTheDocument();
    // The fingerprint is a note on the card, not its heading.
    expect(within(dossiers).getByText('cluster tb-worst')).toBeInTheDocument();
    expect(dossiers).not.toHaveTextContent('cargo test');
    expect(dossiers).not.toHaveTextContent('ops/ci');
  });
});

function toolEdges(count: number): GraphEdge[] {
  return Array.from({ length: count }, (_, index) => ({
    source: `tool:jeryu.get_source_${index}`,
    target: `tool:jeryu.run_target_${index}`,
    kind: 'tool_dependency',
    state: 'fresh' as const,
    weight: 1,
  }));
}

function toolCluster(id: string, score: number): ToolBuildCluster {
  return {
    cluster_id: id,
    repo_id: 'jeryu/demo',
    commit_sha: 'abc',
    fingerprint: 'fp',
    score,
    occurrence_count: 4,
    repo_count: 1,
    file_count: 3,
    total_lines: 60,
    language: 'rust',
    insight: 'Repeated retry loop can become a local tool.',
    normalized_preview: 'loop retry call',
    occurrences: [],
  };
}
