// QualityGatePage.test.tsx — the Quality gate overview and its rule
// drill-down: the tiles, the two tables, the daily chart, the one obvious
// action, and the states (loading, empty, error, older server).

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QualityGatePage } from '../qualityGate/QualityGatePage';
import { QualityGateRulePage } from '../qualityGate/QualityGateRulePage';
import { mockQualityGateApi } from './qualityGateHelpers';
import { errorResponse, json, renderAt } from './shiftPageHelpers';
import { OVERVIEW } from './qualityGateTestData';

afterEach(() => vi.restoreAllMocks());

describe('QualityGatePage', () => {
  it('shows the fail rate, what would have been blocked, and both tables', async () => {
    const calls = mockQualityGateApi();
    renderAt('/quality-gate', '/quality-gate', <QualityGatePage />);

    expect(await screen.findByTestId('quality-gate-tile-fail-rate')).toHaveTextContent('25%');
    expect(screen.getByTestId('quality-gate-tile-would-block')).toHaveTextContent('10');
    expect(screen.getByTestId('quality-gate-tile-disputes')).toHaveTextContent('3');
    expect(
      screen.getByText('10 of 40 scored heads scored below the floor in the last 30 days.')
    ).toBeInTheDocument();

    // Rules worst first, with the dispute rate beside the count.
    const ruleRows = within(screen.getByTestId('quality-gate-rules-table')).getAllByRole('row');
    expect(ruleRows[1]).toHaveTextContent('stale-naming');
    const disputed = screen.getByTestId('quality-gate-rule-evidence-link');
    expect(disputed).toHaveTextContent('75%');

    const repoRow = screen.getByTestId('quality-gate-repo-jeryu/jeryu-web');
    expect(within(repoRow).getByRole('link', { name: 'jeryu/jeryu-web' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-web'
    );
    expect(repoRow).toHaveTextContent('40%');

    // The chart speaks its totals for a reader who does not see it.
    expect(screen.getByTestId('quality-gate-chart')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Scored heads per day: 30 scored over 3 days, 7 below the floor',
      })
    ).toBeInTheDocument();

    expect(calls[0].pathname).toBe('/api/v1/quality-gate/overview');
    expect(calls[0].search).toBe('?days=30');
  });

  it('points at the rule failing most often as the one action', async () => {
    mockQualityGateApi();
    renderAt('/quality-gate', '/quality-gate', <QualityGatePage />);
    const action = await screen.findByTestId('quality-gate-top-rule');
    expect(action).toHaveAttribute('href', '/quality-gate/rules/stale-naming');
    expect(action).toHaveTextContent('Open stale-naming, the rule failing most often');
  });

  it('says so while loading, and when nothing has been scored', async () => {
    mockQualityGateApi(() => json({ ...OVERVIEW, heads_scored: 0, heads_failed: 0, rules: [], repos: [], daily: [] }));
    renderAt('/quality-gate', '/quality-gate', <QualityGatePage />);
    expect(screen.getByText('Loading the quality gate overview…')).toBeInTheDocument();
    expect(await screen.findByText('No head has been scored yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-gate-top-rule')).toBeNull();
  });

  it('degrades plainly on a server without the contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(404, 'no such route'));
    renderAt('/quality-gate', '/quality-gate', <QualityGatePage />);
    expect(
      await screen.findByText('Not available on this server version.')
    ).toBeInTheDocument();
  });

  it('keeps the findings admin-only on a 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(403, 'forbidden'));
    renderAt('/quality-gate', '/quality-gate', <QualityGatePage />);
    expect(
      await screen.findByText('Only admins can see the quality gate overview.')
    ).toBeInTheDocument();
  });

  it('reports any other failure with its cause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(500, 'boom'));
    renderAt('/quality-gate', '/quality-gate', <QualityGatePage />);
    expect(
      await screen.findByText('Could not load the quality gate overview.')
    ).toBeInTheDocument();
  });
});

describe('QualityGateRulePage', () => {
  it('lists the heads the rule flagged, each leading to its score detail', async () => {
    const calls = mockQualityGateApi();
    renderAt(
      '/quality-gate/rules/stale-naming',
      '/quality-gate/rules/:rule',
      <QualityGateRulePage />
    );

    const flagged = await screen.findByTestId('quality-gate-head-jeryu/jeryu-web@0863f25a');
    expect(within(flagged).getByRole('link', { name: 'jeryu/jeryu-web@0863f25a' })).toHaveAttribute(
      'href',
      '/quality-gate/heads/jeryu/jeryu-web/0863f25ab1c2d3e4f5061728394a5b6c7d8e9f01'
    );
    // Below the floor is called out; the head that passed the floor is not.
    expect(within(flagged).getByText('71 / 85')).toHaveClass('page__pill--danger');
    const passing = screen.getByTestId('quality-gate-head-jeryu/jeryu-deploy@a985cb0f');
    expect(within(passing).getByText('88 / 85')).toHaveClass('page__pill--success');

    await waitFor(() =>
      expect(calls.some((c) => c.pathname === '/api/v1/quality-gate/rules/stale-naming')).toBe(true)
    );
  });

  it('says when the rule flagged nothing in the window', async () => {
    mockQualityGateApi((req) =>
      req.pathname.startsWith('/api/v1/quality-gate/rules/')
        ? json({
            schema_version: 1,
            rule: 'stale-naming',
            title: 'A name says what the thing is now',
            description: 'A name that no longer says what the thing is, is a finding.',
            window_days: 30,
            heads: [],
          })
        : undefined
    );
    renderAt(
      '/quality-gate/rules/stale-naming',
      '/quality-gate/rules/:rule',
      <QualityGateRulePage />
    );
    expect(
      await screen.findByText('This rule flagged nothing in the window.')
    ).toBeInTheDocument();
  });
});
