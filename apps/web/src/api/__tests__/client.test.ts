import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiGet, apiSend, setCsrfToken } from '../client';

describe('api client CSRF header', () => {
  afterEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
  });

  it('attaches the Jeryu CSRF token to unsafe requests only', async () => {
    const seen: Array<{ method: string; csrf: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      seen.push({
        method: init?.method ?? 'GET',
        csrf: headers.get('x-jeryu-csrf'),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    setCsrfToken('csrf-test-token');
    await apiGet('/api/v1/auth/me');
    await apiSend('/api/v1/auth/tokens', { name: 'cli' });

    expect(seen).toEqual([
      { method: 'GET', csrf: null },
      { method: 'POST', csrf: 'csrf-test-token' },
    ]);
  });
});

describe('api client error bodies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponse(body: string, status: number, contentType: string, statusText = '') {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status, statusText, headers: { 'content-type': contentType } })
    );
  }

  it('reads the nested error envelope', async () => {
    mockResponse(
      JSON.stringify({ error: { code: 'merge_sha_stale', message: 'Head moved.', request_id: 'r1' } }),
      409,
      'application/json'
    );
    const err = await apiGet('/api/v1/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'merge_sha_stale', message: 'Head moved.', requestId: 'r1' });
  });

  it('reads top-level code and message', async () => {
    mockResponse(
      JSON.stringify({ code: 'workcell_busy', message: 'Workcell is busy.' }),
      422,
      'application/json'
    );
    const err = await apiGet('/api/v1/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'workcell_busy', message: 'Workcell is busy.' });
  });

  it('prefers the nested envelope when both shapes are present', async () => {
    mockResponse(
      JSON.stringify({ code: 'outer', message: 'Outer.', error: { code: 'inner', message: 'Inner.' } }),
      400,
      'application/json'
    );
    const err = await apiGet('/api/v1/x').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, code: 'inner', message: 'Inner.' });
  });

  it('falls back to the status for a non-JSON body', async () => {
    mockResponse('<html>bad gateway</html>', 502, 'text/html', 'Bad Gateway');
    const err = await apiGet('/api/v1/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'internal', message: 'Bad Gateway' });
  });
});
