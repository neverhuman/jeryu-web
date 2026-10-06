// shiftTodoLists.ts — a queue's whole todo list across every family.
//
// The server pages `GET /api/v1/shift/todos` (100 rows unless asked, ordered by
// priority then id), so one request dropped every todo after the first page:
// `/work/<id>` said "No todo <id>" for a todo a worker had just claimed, because
// the id sat on page two of the all-families list. Walk the pages instead.

import { apiGet } from './client';
import { endpoints } from './endpoints';
import type { ShiftTodosResponse } from './types';

/** The most rows the server returns per page. */
export const SHIFT_TODO_PAGE_LIMIT = 500;
/** A ceiling on pages, so a server that never says "no more" cannot spin. */
const MAX_PAGES = 40;

export async function fetchShiftTodos(
  family: string | undefined,
  signal?: AbortSignal
): Promise<ShiftTodosResponse> {
  const todos: ShiftTodosResponse['todos'] = [];
  let generatedAt = '';
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await apiGet<ShiftTodosResponse>(
      endpoints.shiftTodos({
        family,
        limit: String(SHIFT_TODO_PAGE_LIMIT),
        page: String(page),
      }),
      { signal }
    );
    todos.push(...answer.todos);
    generatedAt = answer.generated_at;
    if (!answer.page?.has_more || answer.todos.length === 0) break;
  }
  return { generated_at: generatedAt, todos };
}
