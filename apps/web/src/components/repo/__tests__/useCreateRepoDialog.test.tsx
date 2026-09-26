// useCreateRepoDialog.test.tsx — the create flow sends one request at a time
// and keeps one idempotency key per request body, so a double click or a retry
// after a failure cannot create the repository twice.

import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { apiSend } from '../../../api/client';
import type { RepositorySummary } from '../../../api/types';
import { useCreateRepoDialog } from '../useCreateRepoDialog';

vi.mock('../../../api/client', async (original) => ({
  ...(await original<typeof import('../../../api/client')>()),
  apiSend: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

it('sends one in-flight creation and releases its key after acknowledged completion', async () => {
  let finish: ((repo: RepositorySummary) => void) | undefined;
  const pending = new Promise<RepositorySummary>((resolve) => {
    finish = resolve;
  });
  vi.mocked(apiSend).mockReturnValue(pending);
  const onCreated = vi.fn();
  const { result } = renderHook(() =>
    useCreateRepoDialog({
      open: true,
      onCancel: vi.fn(),
      onCreated,
      defaultHost: 'jeryu',
      defaultOwner: 'alice',
    })
  );
  act(() => result.current.setDraft((draft) => ({ ...draft, name: 'first' })));

  // The second click while the first is in flight must not reach the API.
  let first: Promise<void> | undefined;
  act(() => {
    first = result.current.handleCreate();
    void result.current.handleCreate();
  });
  expect(apiSend).toHaveBeenCalledTimes(1);
  const initialKey = vi.mocked(apiSend).mock.calls[0][2]?.idempotencyKey;
  expect(initialKey).toMatch(/^[a-zA-Z0-9-]{16,128}$/);

  await act(async () => {
    finish?.({} as RepositorySummary);
    await first;
  });
  expect(onCreated).toHaveBeenCalledTimes(1);

  // The acknowledged creation released its key, so the next one is new.
  await act(async () => {
    await result.current.handleCreate();
  });
  expect(apiSend).toHaveBeenCalledTimes(2);
  expect(vi.mocked(apiSend).mock.calls[1][2]?.idempotencyKey).not.toBe(
    initialKey
  );
});

it('keeps the key and body across a failed attempt and mints a new one for a changed request', async () => {
  vi.mocked(apiSend).mockRejectedValue(new Error('server interrupted'));
  const { result } = renderHook(() =>
    useCreateRepoDialog({
      open: true,
      onCancel: vi.fn(),
      defaultHost: 'jeryu',
      defaultOwner: 'alice',
    })
  );
  act(() => result.current.setDraft((draft) => ({ ...draft, name: 'first' })));

  await act(async () => {
    await result.current.handleCreate();
  });
  await act(async () => {
    await result.current.handleCreate();
  });
  const calls = vi.mocked(apiSend).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[1][1]).toEqual(calls[0][1]);
  expect(calls[1][2]?.idempotencyKey).toBe(calls[0][2]?.idempotencyKey);
  expect(result.current.error).toBe('server interrupted');

  act(() => result.current.setDraft((draft) => ({ ...draft, name: 'second' })));
  await act(async () => {
    await result.current.handleCreate();
  });
  expect(vi.mocked(apiSend).mock.calls[2][2]?.idempotencyKey).not.toBe(
    calls[0][2]?.idempotencyKey
  );
});
