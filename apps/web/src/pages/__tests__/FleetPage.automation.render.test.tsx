// FleetPage.automation.render.test.tsx — the "Automation" section of /runners:
// one row per background timer, after the reviewers, and nothing at all when
// no timer reports.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { FleetPage } from '../FleetPage';
// The page's "Waiting on you" strip is Needs you's own list, with its own query
// and tests (needsYouAreas); these runner tests leave it out.
vi.mock('../needsYou/NeedsYouHere', () => ({ NeedsYouHere: () => null }));

import { CONTROL_PLANE_RUNNERS_QUERY_KEY } from '../../hooks/useControlPlaneRunners';
import type { RunnerFabricResponse, RunnerNodeSummary } from '../../api/types';

function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function node(overrides: Partial<RunnerNodeSummary>): RunnerNodeSummary {
  return {
    runnerId: 'xbabe2/slot0',
    source: 'pr-gate-runner',
    state: 'active',
    capacity: 1,
    inFlight: 0,
    labels: ['xbabe2', 'slot 0', 'pr-gate'],
    classes: ['pr-gate'],
    activeTaskCount: 0,
    lastUpdated: ago(20),
    activeTasks: [],
    ...overrides
  };
}

function timerNode(
  name: string,
  overrides: Partial<RunnerNodeSummary>
): RunnerNodeSummary {
  return node({
    runnerId: `xbabe0/${name}`,
    source: 'automation',
    capacity: 0,
    labels: ['xbabe0', 'slot 0', 'automation'],
    classes: ['automation'],
    offlineAfterSeconds: 900,
    ...overrides
  });
}

function renderFleet(nodeDetails: RunnerNodeSummary[]): void {
  const runners: RunnerFabricResponse = {
    schemaVersion: 'jeryu.runner_fabric/v1',
    local: {
      state: 'fresh',
      nodes: 2,
      onlineRunners: 1,
      offlineRunners: 0,
      busyRunners: 0,
      idleRunners: 1,
      totalSlots: 1,
      activeSlots: 1,
      utilization: 0,
      lastUpdated: ago(20),
      nodeDetails
    },
    mirror: {
      name: 'github_actions_runners',
      state: 'missing',
      reason: 'not configured',
      docsUrl: 'docs/agent-native-standard.md'
    }
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  client.setQueryData(CONTROL_PLANE_RUNNERS_QUERY_KEY, runners);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FleetPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FleetPage automation', () => {
  it('lists each timer once, after the reviewers, with what it last did', () => {
    renderFleet([
      node({}),
      timerNode('auto-pin', {
        // Four minutes since the beat of a five-minute timer: healthy.
        lastUpdated: ago(240),
        lastActivity: {
          repo: 'jeryu/jeryu-deploy',
          pr: 74,
          sha: 'ea04cac1f05eadc15694dd1434d9f8f99c44a0d3',
          recipe: 'auto-pin',
          conclusion: 'opened',
          seconds: 0,
          finishedAt: ago(600)
        }
      }),
      timerNode('auto-stage', {
        state: 'offline',
        lastUpdated: ago(3600),
        lastActivity: {
          repo: 'jeryu/jeryu-deploy',
          pr: null,
          sha: '77dc3310aa5eadc15694dd1434d9f8f99c44a0d3',
          recipe: 'auto-stage',
          conclusion: 'staged',
          seconds: 0,
          finishedAt: ago(7200)
        }
      })
    ]);

    // Section titles only: an empty-state surface inside a section carries a
    // heading of its own, which is not one of the sections being ordered.
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .filter((heading) => heading.classList.contains('page__section-title'))
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Gate runners', 'Pull request reviewers', 'Automation']);

    const section = screen.getByTestId('fleet-automation');
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    // A timer is not a gate slot or a reviewer as well.
    expect(screen.queryByTestId('fleet-node-xbabe0_auto-pin')).toBeNull();
    expect(screen.queryByTestId('fleet-reviewer-xbabe0_auto-pin')).toBeNull();
    expect(screen.getByTestId('fleet-metrics').textContent).toContain(
      '1 gate runner on xbabe2'
    );

    const pin = screen.getByTestId('fleet-automation-xbabe0_auto-pin');
    expect(pin.className).toContain('is-online');
    expect(within(pin).getByRole('heading', { level: 3 }).textContent).toBe(
      'Auto-pin'
    );
    expect(pin.textContent).toContain('xbabe0');
    const pinDid = screen.getByTestId('fleet-automation-did-xbabe0_auto-pin');
    expect(pinDid.textContent).toContain('opened jeryu-deploy#74');
    const links = within(pin).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/74'
    );
    expect(
      screen.getByTestId('fleet-automation-seen-xbabe0_auto-pin').textContent
    ).not.toContain('offline');

    const stage = screen.getByTestId('fleet-automation-xbabe0_auto-stage');
    expect(stage.className).toContain('is-offline');
    expect(stage.getAttribute('aria-label')).toBe('Auto-stage: offline');
    expect(
      screen.getByTestId('fleet-automation-did-xbabe0_auto-stage').textContent
    ).toContain('staged 77dc331');
    expect(within(stage).queryAllByRole('link')).toHaveLength(0);
    const seen = screen.getByTestId('fleet-automation-seen-xbabe0_auto-stage');
    expect(seen.textContent).toContain('offline, last seen');
    expect(seen.querySelector('.fleet__tone--failed')).not.toBeNull();
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
  });

  it('says nothing yet for a timer with no history', () => {
    renderFleet([node({}), timerNode('auto-pin', {})]);
    expect(
      screen.getByTestId('fleet-automation-did-xbabe0_auto-pin').textContent
    ).toBe('nothing yet');
  });

  it('has no Automation section, not an empty box, when no timer reports', () => {
    renderFleet([node({})]);
    expect(screen.queryByTestId('fleet-automation')).toBeNull();
    expect(screen.queryByText('Automation')).toBeNull();
  });
});
