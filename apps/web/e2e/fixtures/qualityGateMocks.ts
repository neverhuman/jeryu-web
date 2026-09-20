// qualityGateMocks.ts — browser-boundary mocks for the quality-gate
// observation contract: the overview, one rule's flagged heads, one head's
// score detail, and the dispute an admin records on a finding.
//
// Register AFTER `mockBootstrap` (Playwright matches the newest route first).
// Without these the shared 404 fallback answers, which is exactly what a
// server that predates the contract looks like to the SPA.

import type { Page, Route } from '@playwright/test';

export const FLAGGED_SHA = '0863f25ab1c2d3e4f5061728394a5b6c7d8e9f01';

export function overviewBody(): Record<string, unknown> {
  return {
    schema_version: 1,
    generated_at: '2026-09-19T16:00:00Z',
    window_days: 30,
    heads_scored: 40,
    heads_failed: 10,
    fail_rate: 0.25,
    disputes: 3,
    rules: [
      {
        rule: 'evidence-link',
        title: 'Every claim carries a link to its evidence',
        failures: 4,
        repos: 2,
        disputes: 3,
        dispute_rate: 0.75,
      },
      {
        rule: 'stale-naming',
        title: 'A name says what the thing is now',
        failures: 12,
        repos: 3,
        disputes: 0,
        dispute_rate: 0,
      },
    ],
    repos: [
      {
        repo: 'jeryu/jeryu-web',
        heads_scored: 20,
        heads_failed: 8,
        fail_rate: 0.4,
        top_rule: 'stale-naming',
      },
      {
        repo: 'jeryu/jeryu-deploy',
        heads_scored: 20,
        heads_failed: 2,
        fail_rate: 0.1,
        top_rule: null,
      },
    ],
    daily: [
      { day: '2026-09-17', passed: 8, failed: 2 },
      { day: '2026-09-18', passed: 6, failed: 4 },
      { day: '2026-09-19', passed: 9, failed: 1 },
    ],
  };
}

export function ruleBody(): Record<string, unknown> {
  return {
    schema_version: 1,
    rule: 'stale-naming',
    title: 'A name says what the thing is now',
    description: 'A name that no longer says what the thing is, is a finding.',
    window_days: 30,
    heads: [
      {
        repo: 'jeryu/jeryu-web',
        sha: FLAGGED_SHA,
        branch: 'nightshift/2026-09-19',
        scored_at: '2026-09-19T12:00:00Z',
        score: 71,
        threshold: 85,
        findings: 2,
        disputes: 1,
      },
    ],
  };
}

export function headBody(): Record<string, unknown> {
  return {
    schema_version: 1,
    repo: 'jeryu/jeryu-web',
    sha: FLAGGED_SHA,
    branch: 'nightshift/2026-09-19',
    scored_at: '2026-09-19T12:00:00Z',
    score: 71,
    threshold: 85,
    passed: false,
    findings: [
      {
        id: 'f-1',
        rule: 'stale-naming',
        title: 'A name no longer says what the thing is',
        path: 'src/pages/ToolsPage.tsx',
        line: 42,
        evidence: 'const oldToolMap = buildToolMap();',
        disputed: false,
        dispute_reason: null,
        disputed_by: null,
        disputed_at: null,
      },
      {
        id: 'f-2',
        rule: 'evidence-link',
        title: 'A claim without a link to its evidence',
        path: 'docs/proof.md',
        line: 7,
        evidence: 'The gate runs on every push.',
        disputed: true,
        dispute_reason: 'The link is one line above.',
        disputed_by: 'alton',
        disputed_at: '2026-09-19T13:00:00Z',
      },
    ],
  };
}

export interface QualityGateMockLog {
  /** Bodies of every dispute the page posted, in order. */
  disputes: Array<{ path: string; reason: string }>;
}

export async function mockQualityGateApi(page: Page): Promise<QualityGateMockLog> {
  const log: QualityGateMockLog = { disputes: [] };
  const json = (route: Route, body: unknown): Promise<void> =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(/\/api\/v1\/quality-gate\/overview(\?.*)?$/, (route) =>
    json(route, overviewBody())
  );
  await page.route(/\/api\/v1\/quality-gate\/rules\/.*$/, (route) => json(route, ruleBody()));
  await page.route(/\/api\/v1\/quality-gate\/heads\/.*$/, (route) => json(route, headBody()));
  await page.route(/\/api\/v1\/quality-gate\/findings\/.*\/dispute$/, (route, request) => {
    const body = JSON.parse(request.postData() ?? '{}') as { reason?: string };
    log.disputes.push({
      path: new URL(request.url()).pathname,
      reason: body.reason ?? '',
    });
    const finding = (headBody().findings as Array<Record<string, unknown>>)[0];
    return json(route, {
      finding: {
        ...finding,
        disputed: true,
        dispute_reason: body.reason ?? '',
        disputed_by: 'alton',
        disputed_at: '2026-09-19T17:00:00Z',
      },
    });
  });
  return log;
}
