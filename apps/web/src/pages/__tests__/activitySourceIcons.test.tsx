// activitySourceIcons.test.tsx — the mark in front of each row's label pill:
// one icon per reporting tool, grouped so agent work, the gates and the
// releases are three tints, and the source named in title and aria-label.

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { sourceMark } from '../activity/sourceModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { renderAt } from './shiftPageHelpers';

const mark = (seq: number): HTMLElement => screen.getByTestId(`activity-event-source-${seq}`);

describe('sourceMark', () => {
  it('groups the agents, the gates and the release steps apart', () => {
    expect(sourceMark('todoq').group).toBe('agent');
    expect(sourceMark('pr-gate').group).toBe('gate');
    expect(sourceMark('pr-redteam').group).toBe('gate');
    expect(sourceMark('auto-stage').group).toBe('release');
    expect(sourceMark('auto-pin').group).toBe('release');
    expect(sourceMark('deploy').group).toBe('release');
    expect(sourceMark('forge').group).toBe('forge');
  });

  it('gives every known source its own icon', () => {
    const sources = ['todoq', 'pr-gate', 'pr-redteam', 'auto-stage', 'auto-pin', 'deploy', 'forge'];
    const icons = new Set(sources.map((source) => sourceMark(source).Icon));
    expect(icons.size).toBe(sources.length);
  });

  it('says the source name, as the event gave it', () => {
    expect(sourceMark('pr-gate').title).toBe('Source: pr-gate');
    expect(sourceMark('  deploy  ').title).toBe('Source: deploy');
  });

  it('still marks a source it has never heard of', () => {
    const unknown = sourceMark('some-new-tool');
    expect(unknown.group).toBe('other');
    expect(unknown.title).toBe('Source: some-new-tool');
    expect(unknown.Icon).toBeTruthy();
    expect(sourceMark('').title).toBe('Source: unnamed');
  });
});

describe('Activity source marks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('marks each row with its reporting tool, before the label', async () => {
    mockPipelineApi();
    renderAt('/activity', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-event-12');

    expect(mark(12)).toHaveAttribute('aria-label', 'Source: auto-stage');
    expect(mark(12)).toHaveAttribute('title', 'Source: auto-stage');
    expect(mark(12)).toHaveAttribute('data-source-group', 'release');
    expect(mark(10)).toHaveAttribute('data-source-group', 'gate');
    expect(mark(9)).toHaveAttribute('data-source-group', 'agent');
    // The row that names no source of its own falls back to the forge.
    expect(mark(11)).toHaveAttribute('aria-label', 'Source: forge');

    // The mark comes first on the line, so the pill reads as labelled by it.
    const line = mark(10).parentElement as HTMLElement;
    const order = Array.from(line.children);
    expect(order.indexOf(mark(10))).toBeLessThan(
      order.findIndex((child) => child.textContent === 'Gate failed')
    );
    // And it is one drawn mark, not a word added to the line.
    expect(mark(10).querySelector('svg')).toBeTruthy();
    expect(mark(10).textContent).toBe('');
  });
});
