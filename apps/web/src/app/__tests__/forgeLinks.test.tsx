// forgeLinks.test.tsx — a link pasted in the forge's own shape lands on the
// matching tab of our repository page.
//
// Agents and people paste `/<owner>/<repo>/blob/<ref>/<path>` and friends:
// those are the URLs a forge hands out. Each shape is driven through the
// element the real route map registers for it, against a repository list that
// says which provider `acme/widgets` is on — the provider is never assumed.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { router } from '../router';

const HOST = 'acme-forge';
const OWNER = 'acme';
const NAME = 'widgets';
const FRONT = `/repos/${HOST}/${OWNER}/${NAME}`;

/** The forge-shaped routes, taken from the live table rather than re-declared. */
function forgeRoutes(): Array<{ path: string; element: JSX.Element }> {
  return (router.routes[0]?.children ?? [])
    .filter((child) => child.path?.startsWith(':owner/:repo'))
    .map((child) => ({ path: `/${child.path}`, element: child.element as JSX.Element }));
}

/** Follow a forge-shaped URL; return the canonical URL it ends on. */
async function follow(from: string): Promise<string> {
  const routes = forgeRoutes();
  expect(matchRoutes(routes, from), `a route matches ${from}`).toBeTruthy();
  const memoryRouter = createMemoryRouter(
    [...routes, { path: '/repos/:provider/*', element: <p>repository page</p> }],
    { initialEntries: [from] }
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={memoryRouter} />
    </QueryClientProvider>
  );
  await vi.waitFor(() => {
    expect(memoryRouter.state.location.pathname.startsWith('/repos/')).toBe(true);
  });
  const { pathname, search, hash } = memoryRouter.state.location;
  return `${pathname}${search}${hash}`;
}

describe('forge-shaped repository links', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(rawUrl, 'http://localhost');
      if (pathname === '/api/v1/repos') {
        return new Response(
          JSON.stringify({
            generated_at: '2026-10-03T00:00:00Z',
            total: 1,
            repositories: [
              {
                id: { host: HOST, owner: OWNER, name: NAME },
                default_branch: 'main',
                visibility: 'public',
              },
            ],
            facets: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: { code: 'not_found', message: pathname } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    // The repository itself.
    [`/${OWNER}/${NAME}`, FRONT],
    // Its pull requests, as a list and as one of them.
    [`/${OWNER}/${NAME}/pulls`, `${FRONT}/pulls`],
    [`/${OWNER}/${NAME}/pulls?state=open`, `${FRONT}/pulls?state=open`],
    [`/${OWNER}/${NAME}/pull/31`, `${FRONT}/pulls/31`],
    [`/${OWNER}/${NAME}/pull/31#comment-7`, `${FRONT}/pulls/31#comment-7`],
    // The per-repository tracker is retired; `RepoRouter` sends this canonical
    // path on to the repository front page.
    [`/${OWNER}/${NAME}/issues/7`, `${FRONT}/issues/7`],
    // A file and a folder at a ref, with the ref and the path kept whole.
    [`/${OWNER}/${NAME}/blob/main/src/widget.rs`, `${FRONT}/blob/main/src/widget.rs`],
    [`/${OWNER}/${NAME}/blob/main/src/widget.rs#L12`, `${FRONT}/blob/main/src/widget.rs#L12`],
    [`/${OWNER}/${NAME}/tree/main/docs/runbooks`, `${FRONT}/tree/main/docs/runbooks`],
    // One commit.
    [
      `/${OWNER}/${NAME}/commit/0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c`,
      `${FRONT}/commit/0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c`,
    ],
  ])('%s lands on %s', async (from, to) => {
    expect(await follow(from)).toBe(to);
  });

  it('takes the provider from the repository list, not from the link', async () => {
    const landed = await follow(`/${OWNER}/${NAME}/pull/31`);
    expect(landed.startsWith(`/repos/${HOST}/`)).toBe(true);
  });
});
