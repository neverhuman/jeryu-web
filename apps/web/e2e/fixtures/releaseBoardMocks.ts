// releaseBoardMocks.ts — route mocks for the family release board on
// /releases: `GET /api/v1/release-board` (the families that reported),
// `GET /api/v1/release-board/{family}` (one snapshot) and the forge
// environments the live overlay reads. The snapshots are the 2026-09-28 audit
// fixtures, read from the same files the unit tests import.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page, Route } from '@playwright/test';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'test',
  'fixtures',
  'releaseBoard'
);

export interface BoardSnapshot {
  family: string;
  observed_at: string;
  summary: string;
  collector: Record<string, unknown>;
  problems: unknown[];
  [key: string]: unknown;
}

function snapshot(family: string): BoardSnapshot {
  const parsed: BoardSnapshot = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `fixture-${family}.json`), 'utf8')
  );
  return parsed;
}

/** Sorted by family, as the server lists them. */
export const BOARD_SNAPSHOTS: BoardSnapshot[] = ['jain', 'jeryu', 'veox-ai'].map(snapshot);

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Serve the board list and each family's snapshot; `summaryOf` may rewrite a summary. */
export async function mockBoards(
  page: Page,
  options: { listStatus?: number; summaryOf?: (family: string) => string | undefined } = {}
): Promise<void> {
  await page.route('**/api/v1/release-board**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/v1/release-board') {
      if (options.listStatus) {
        await fulfillJson(
          route,
          { error: { code: 'permission_denied', message: 'admin only' } },
          options.listStatus
        );
        return;
      }
      await fulfillJson(route, {
        boards: BOARD_SNAPSHOTS.map((s) => ({
          family: s.family,
          observed_at: s.observed_at,
          accepted_at: s.observed_at,
          summary: s.summary,
          collector: s.collector,
          problem_count: s.problems.length,
        })),
      });
      return;
    }
    const family = decodeURIComponent(pathname.split('/').pop() ?? '');
    const found = BOARD_SNAPSHOTS.find((s) => s.family === family);
    if (!found) {
      await fulfillJson(route, { error: { code: 'not_found', message: 'no board' } }, 404);
      return;
    }
    const summary = options.summaryOf?.(family) ?? found.summary;
    await fulfillJson(route, { ...found, summary, accepted_at: found.observed_at });
  });
}

/**
 * Forge environments for every repository: empty (nothing newer than the
 * snapshots) unless `production` is given, which veox-ai/ai-veox-app then
 * reports as deployed just now.
 */
export async function mockEnvironments(
  page: Page,
  production?: { sha: string; ref: string }
): Promise<void> {
  await page.route('**/api/v3/repos/*/*/environments', async (route) => {
    if (!production || !route.request().url().includes('/veox-ai/ai-veox-app/')) {
      await fulfillJson(route, { total_count: 0, environments: [] });
      return;
    }
    const current = {
      deployment: {
        id: 41,
        sha: production.sha,
        ref: production.ref,
        task: 'deploy',
        environment: 'production',
        description: null,
        payload: {},
        creator: { login: 'alton2' },
        created_at: new Date().toISOString(),
        production_environment: true,
        transient_environment: false,
      },
      status: null,
      succeeded: true,
    };
    await fulfillJson(route, {
      total_count: 1,
      environments: [{ name: 'production', latest: current, current, previous: null }],
    });
  });
}
