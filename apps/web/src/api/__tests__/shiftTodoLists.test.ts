import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../client', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) }));

import { fetchShiftTodos, SHIFT_TODO_PAGE_LIMIT } from '../shiftTodoLists';

const row = (id: string) => ({ id });

describe('fetchShiftTodos', () => {
  beforeEach(() => apiGet.mockReset());

  it('follows has_more, so a todo past the first page is still in the list', async () => {
    apiGet
      .mockResolvedValueOnce({
        generated_at: '2026-10-06T20:00:00Z',
        todos: [row('20261006-1')],
        page: { limit: 1, page: 1, total: 2, has_more: true },
      })
      .mockResolvedValueOnce({
        generated_at: '2026-10-06T20:00:01Z',
        todos: [row('20261006-201244-b2487c')],
        page: { limit: 1, page: 2, total: 2, has_more: false },
      });
    const list = await fetchShiftTodos(undefined);
    expect(list.todos.map((todo) => todo.id)).toEqual(['20261006-1', '20261006-201244-b2487c']);
    expect(apiGet.mock.calls.map((call) => call[0])).toEqual([
      `/api/v1/shift/todos?limit=${SHIFT_TODO_PAGE_LIMIT}&page=1`,
      `/api/v1/shift/todos?limit=${SHIFT_TODO_PAGE_LIMIT}&page=2`,
    ]);
  });

  it('reads one page from a server that reports no paging, and keeps the family filter', async () => {
    apiGet.mockResolvedValueOnce({ generated_at: '2026-10-06T20:00:00Z', todos: [row('a')] });
    await fetchShiftTodos('jeryu');
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0][0]).toBe(
      `/api/v1/shift/todos?family=jeryu&limit=${SHIFT_TODO_PAGE_LIMIT}&page=1`
    );
  });

  it('stops on an empty page even if the server still says has_more', async () => {
    apiGet.mockResolvedValue({
      generated_at: '2026-10-06T20:00:00Z',
      todos: [],
      page: { limit: SHIFT_TODO_PAGE_LIMIT, page: 1, total: 0, has_more: true },
    });
    await fetchShiftTodos(undefined);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
