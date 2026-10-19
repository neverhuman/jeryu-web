import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../client', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) }));

import { ATTENTION_PAGE_LIMIT, fetchAttention } from '../attentionPages';

const item = (id: string, family: string) => ({ id, family, severity: 'action', kind: 'todo_blocked' });
const counts = { critical: 0, action: 2, watch: 0 };
const families = [{ family: 'acme', family_label: 'acme', subjects: counts }];

describe('fetchAttention', () => {
  beforeEach(() => apiGet.mockReset());

  it('follows has_more, so a family whose rows sit past the first page still has them', async () => {
    apiGet
      .mockResolvedValueOnce({
        generated_at: '2026-10-19T15:00:00Z',
        items: [item('globex-1', 'globex')],
        counts,
        families,
        page: { limit: 1, page: 1, total: 2, has_more: true },
      })
      .mockResolvedValueOnce({
        generated_at: '2026-10-19T15:00:01Z',
        items: [item('acme-1', 'acme')],
        counts,
        families,
        page: { limit: 1, page: 2, total: 2, has_more: false },
      });
    const inbox = await fetchAttention();
    expect(inbox.items.map((row) => row.id)).toEqual(['globex-1', 'acme-1']);
    // The whole-inbox fields come from the first page, unchanged.
    expect(inbox.generated_at).toBe('2026-10-19T15:00:00Z');
    expect(inbox.counts).toEqual(counts);
    expect(inbox.families).toEqual(families);
    expect(apiGet.mock.calls.map((call) => call[0])).toEqual([
      `/api/v1/attention?limit=${ATTENTION_PAGE_LIMIT}&page=1`,
      `/api/v1/attention?limit=${ATTENTION_PAGE_LIMIT}&page=2`,
    ]);
  });

  it('reads one page from a server that reports no paging', async () => {
    apiGet.mockResolvedValueOnce({
      generated_at: '2026-10-19T15:00:00Z',
      items: [item('acme-1', 'acme')],
      counts,
    });
    const inbox = await fetchAttention();
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.families).toBeUndefined();
  });

  it('stops on an empty page even if the server still says has_more', async () => {
    apiGet.mockResolvedValue({
      generated_at: '2026-10-19T15:00:00Z',
      items: [],
      counts: { critical: 0, action: 0, watch: 0 },
      page: { limit: ATTENTION_PAGE_LIMIT, page: 1, total: 0, has_more: true },
    });
    await fetchAttention();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
