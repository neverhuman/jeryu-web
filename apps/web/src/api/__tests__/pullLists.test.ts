import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../client', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) }));

import { fetchPullList, PULL_PAGE_LIMIT } from '../pullLists';

const pr = (number: number) => ({ number });

describe('fetchPullList', () => {
  beforeEach(() => apiGet.mockReset());

  it('follows has_more until the last page, so pull requests past the first page are kept', async () => {
    apiGet
      .mockResolvedValueOnce({
        items: [pr(1), pr(2)],
        total: 3,
        page: { limit: 2, page: 1, total: 3, has_more: true },
      })
      .mockResolvedValueOnce({
        items: [pr(3)],
        total: 3,
        page: { limit: 2, page: 2, total: 3, has_more: false },
      });
    const list = await fetchPullList('acme/forge', 'open');
    expect(list.items.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(list.total).toBe(3);
    expect(apiGet.mock.calls.map((call) => call[0])).toEqual([
      `/api/v1/repos/acme%2Fforge/pulls?state=open&limit=${PULL_PAGE_LIMIT}&page=1`,
      `/api/v1/repos/acme%2Fforge/pulls?state=open&limit=${PULL_PAGE_LIMIT}&page=2`,
    ]);
  });

  it('reads one page from a server that reports no paging', async () => {
    apiGet.mockResolvedValueOnce({ items: [pr(7)], total: 1 });
    const list = await fetchPullList('acme/forge', undefined);
    expect(list.items).toHaveLength(1);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0][0]).toBe(
      `/api/v1/repos/acme%2Fforge/pulls?limit=${PULL_PAGE_LIMIT}&page=1`
    );
  });

  it('stops on an empty page even if the server still says has_more', async () => {
    apiGet.mockResolvedValue({
      items: [],
      total: 0,
      page: { limit: PULL_PAGE_LIMIT, page: 1, total: 0, has_more: true },
    });
    await fetchPullList('acme/forge', 'all');
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
