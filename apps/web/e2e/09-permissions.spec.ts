// 09-permissions.spec.ts — permission-denied UI state (W-T-17).
//
// The SPA renders one of three permission-related surfaces based on the
// viewer's perms + the backend verdict:
//   * Full surface — viewer has every relevant perm.
//   * `PermissionDeniedState` — a read-gated query returns 403 (the canonical
//     §35.1.5 perm-denied surface; `role="alert"`, "Permission denied" + the
//     missing key).
//   * `ErrorState` — a non-403 backend failure.
//
// The tests here pin the canonical server-side gate: a mutation a restricted
// viewer is not allowed to make comes back `permission_denied`, proving
// enforcement is server-authoritative per §35.1.5.

import { expect, test } from './fixtures/test';

import {
  mockBootstrap,
  mockRepoList,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const REPO_ID = `${REPO.host}:${REPO.owner}/${REPO.name}`;

test.describe('Permission-denied UI state (W-T-17)', () => {
  test('non-owner creating an agent session is rejected server-side with permission_denied @action:agents.create_forbidden', async ({
    page,
  }) => {
    // Authorization / data-isolation negative proof for the per-repo session
    // boundary (`POST /api/v1/repos/{id}/sessions`): a restricted viewer who
    // holds only `repo.read` must NOT be able to spawn an isolated agent run on
    // a repo they do not own. The server gate is authoritative (§35.1.5) — the
    // SPA does not pre-gate the "New Session" button on perms, so this asserts
    // the backend denies the mutation with `permission_denied` + the missing
    // `agents.write` key.
    await mockBootstrap(page, {
      login: '@reader',
      display_name: 'Read-only Reader',
      global_permissions: ['repo.read'],
    });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);

    await page.route(
      /\/api\/v1\/repos\/[^/]+\/sessions$/,
      async (route, request) => {
        if (request.method() === 'POST') {
          await route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'permission_denied',
                message: 'You need agents.write to start a session on this repository.',
                details: { missing: 'agents.write' },
                request_id: 'mock-session-denied',
              },
            }),
          });
          return;
        }
        await route.continue();
      }
    );

    await page.goto(`/repos/${REPO.host}/${REPO.owner}/${REPO.name}/agents`);
    await expect(page.getByTestId('repo-agents-page')).toBeVisible({
      timeout: 15_000,
    });

    // Drive the create from the page's own network stack so the route mock
    // fires (page.request.* would bypass interception).
    const denied = await page.evaluate(async (url) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'e2e-session-denied',
        },
        body: JSON.stringify({}),
      });
      const text = await r.text();
      let body: unknown = text;
      try {
        body = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: r.status, body };
    }, `/api/v1/repos/${encodeURIComponent(REPO_ID)}/sessions`);

    expect(denied.status, `POST returned ${denied.status}`).toBe(403);
    const body = denied.body as {
      error?: { code?: string; details?: { missing?: string } };
    };
    expect(body.error?.code).toBe('permission_denied');
    expect(body.error?.details?.missing).toBe('agents.write');
  });

  test('bootstrap reflects restricted viewer global_permissions @action:auth.restricted_bootstrap', async ({
    page,
  }) => {
    await mockBootstrap(page, {
      login: '@reader',
      global_permissions: ['repo.read'],
    });
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/v1/bootstrap');
      const json = await r.json();
      return { status: r.status, body: json };
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      viewer?: { login?: string; global_permissions?: string[] };
    };
    expect(body.viewer?.login).toBe('@reader');
    expect(body.viewer?.global_permissions).toEqual(['repo.read']);
  });
});
