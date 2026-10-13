import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../client';
import { SESSION_TASK_MAX_BYTES, createSession, sessionTaskBytes } from '../sessions';
import type { CreateSessionResponse } from '../agentTerminal';

function sessionBody(): CreateSessionResponse {
  return {
    run_id: 'run-xyz',
    branch: 'agent/session-xyz',
    base_oid: 'a'.repeat(40),
    ws_scope: 'agent_run.run-xyz',
    tty_topic: 'agent_run.run-xyz.tty',
    control_url: '/api/v1/agent-runs/run-xyz/control',
    status_url: '/api/v1/agent-runs/run-xyz/status',
  };
}

describe('createSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /repos/{id}/sessions with an idempotency key and parses the run', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(sessionBody()), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      );

    const result = await createSession('repo-1', { provider: 'codex' });

    expect(result.run_id).toBe('run-xyz');
    expect(result.branch).toBe('agent/session-xyz');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('/api/v1/repos/repo-1/sessions');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ provider: 'codex' });
    const headers = new Headers(init?.headers);
    expect(headers.get('Idempotency-Key')).toBeTruthy();
    expect(headers.get('Content-Type')).toContain('application/json');
  });

  it('sends the model when one is named, trimmed, and leaves it out when blank', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(sessionBody()), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
    );

    await createSession('repo-1', { provider: 'grok', model: ' grok-4 ' });
    await createSession('repo-1', { provider: 'claude', model: '   ' });
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      provider: 'grok',
      model: 'grok-4',
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toEqual({ provider: 'claude' });
  });

  it('sends the task trimmed, beside the model, and keeps its inner lines', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(sessionBody()), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
    );

    await createSession('repo-1', {
      provider: 'claude',
      task: '  Fix the flaky parser test.\n\nThen run the suite.\n ',
    });
    await createSession('repo-1', { provider: 'grok', model: 'grok-4', task: '\tWrite the notes ' });

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      provider: 'claude',
      task: 'Fix the flaky parser test.\n\nThen run the suite.',
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toEqual({
      provider: 'grok',
      model: 'grok-4',
      task: 'Write the notes',
    });
  });

  it('sends no task key when the task is empty or only whitespace', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(sessionBody()), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
    );

    await createSession('repo-1', { provider: 'codex', task: '' });
    await createSession('repo-1', { provider: 'codex', task: ' \n\t \r\n ' });
    await createSession('repo-1', { provider: 'codex', model: 'gpt-5', task: '   ' });

    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { provider: 'codex' },
      { provider: 'codex' },
      { provider: 'codex', model: 'gpt-5' },
    ]);
    for (const body of bodies) expect(body).not.toHaveProperty('task');
  });

  it('counts a task in UTF-8 bytes once trimmed, not in characters', () => {
    const twoByte = '\u00e9'; // é
    const threeByte = '\u20ac'; // €
    const fourByte = '\u{1f980}'; // an emoji: one character, two UTF-16 units
    expect(SESSION_TASK_MAX_BYTES).toBe(8000);
    expect(sessionTaskBytes('')).toBe(0);
    expect(sessionTaskBytes('  fix it \n')).toBe(6);
    // 4000 two-byte characters are exactly the limit; one more is over it.
    expect(twoByte.repeat(4000)).toHaveLength(4000);
    expect(sessionTaskBytes(twoByte.repeat(4000))).toBe(8000);
    expect(sessionTaskBytes(twoByte.repeat(4000))).toBeLessThanOrEqual(SESSION_TASK_MAX_BYTES);
    expect(sessionTaskBytes(twoByte.repeat(4001))).toBe(8002);
    expect(sessionTaskBytes(twoByte.repeat(4001))).toBeGreaterThan(SESSION_TASK_MAX_BYTES);
    expect(sessionTaskBytes(threeByte)).toBe(3);
    expect(sessionTaskBytes(fourByte)).toBe(4);
    // Only the trimmed text counts: surrounding whitespace is never sent.
    expect(sessionTaskBytes(` ${twoByte.repeat(4000)}\n\n`)).toBe(8000);
  });

  it('encodes the repo id into the path', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(sessionBody()), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      );

    await createSession('group/repo', { provider: 'codex' });
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      '/api/v1/repos/group%2Frepo/sessions'
    );
  });

  it('rejects with an ApiError carrying the backend envelope on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'capacity_exhausted', message: 'No runner slots free.' },
        }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(createSession('repo-1', { provider: 'codex' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'capacity_exhausted',
    });
    // The thrown value is a real ApiError instance, not a bare object.
    await expect(createSession('repo-1', { provider: 'codex' })).rejects.toBeInstanceOf(
      ApiError
    );
  });
});
