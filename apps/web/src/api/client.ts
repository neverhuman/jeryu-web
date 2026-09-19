// client.ts — fetch wrapper for the JeRyu Web Forge REST API (W-FE-03).
//
// Surface:
//   - `apiGet<T>(url)`             — GET, JSON.
//   - `apiSend<T>(url, body, opts)` — POST, JSON, optional `Idempotency-Key`.
//   - `apiPut<T>(url, body, opts)`  — PUT, JSON, optional `Idempotency-Key`.
//   - `apiPatch<T>(url, body, opts)` — PATCH with the same headers.
//   - `apiDelete(url, opts)`        — DELETE; returns void on 204.
//   - `apiDeleteWithBody<T>(url, body, opts)` — HTTP removal request that
//     carries a JSON confirmation payload and parses a typed JSON receipt.
//
// Responses with `application/json` content-type are parsed; non-JSON 4xx/5xx
// fall through to `ApiError` with the raw status text.
//
// Error envelope per §35.1.11 — backend errors come back as:
//   { "error": { "code": "...", "message": "...", "details": ..., "request_id": "...", "event_cursor": 123 } }
// jeryu-api typed errors put `code`/`message` at the top level instead; both
// shapes are accepted, preferring the nested one when present.
// We pluck those fields into the thrown `ApiError` instance so callers can
// branch on `err.code === 'merge_sha_stale'` etc.
//
// Headers:
//   - `Idempotency-Key` (§35.1.3) is set when the caller passes
//     `opts.idempotencyKey`. Required for mutations the backend gates on it
//     (create/merge/delete/archive/settings/secrets).
//   - `X-Jeryu-CSRF` is forwarded for unsafe cookie-auth API requests.
//   - `Accept: application/json` and `Content-Type: application/json` are
//     attached when a body is sent.

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
  event_cursor?: number;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;
  public readonly requestId: string | undefined;
  public readonly eventCursor: number | undefined;

  constructor(
    status: number,
    envelope: ApiErrorEnvelope,
    options?: { cause?: unknown }
  ) {
    super(envelope.message, options as ErrorOptions | undefined);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.details = envelope.details;
    this.requestId = envelope.request_id;
    this.eventCursor = envelope.event_cursor;
  }
}

export interface ApiRequestOptions {
  idempotencyKey?: string;
  csrfToken?: string;
  signal?: AbortSignal;
  /** Override the default `Accept: application/json`. */
  accept?: string;
  /** Extra headers; merged after the defaults. */
  headers?: Record<string, string>;
}

let globalCsrfToken: string | null = null;

export function setCsrfToken(token: string | null | undefined): void {
  globalCsrfToken = token ?? null;
}

function buildHeaders(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  hasBody: boolean,
  opts: ApiRequestOptions | undefined
): HeadersInit {
  const headers: Record<string, string> = {
    Accept: opts?.accept ?? 'application/json',
  };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (opts?.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }
  if (opts?.csrfToken) {
    headers['X-Jeryu-CSRF'] = opts.csrfToken;
  } else if (method !== 'GET' && globalCsrfToken) {
    headers['X-Jeryu-CSRF'] = globalCsrfToken;
  }
  if (opts?.headers) {
    Object.assign(headers, opts.headers);
  }
  return headers;
}

/**
 * Runtime guard for an error envelope. `response.json()` returns `unknown`;
 * we prove the `{ code, message, ... }` shape here before plucking fields
 * into `ApiError`, so no field is read off an unvalidated value.
 */
function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.message === 'string';
}

/**
 * Accepts both server shapes: the §35.1.11 nested `{ error: { code, message } }`
 * envelope (preferred when present) and the top-level `{ code, message }`
 * body returned by jeryu-api's typed errors.
 */
function extractErrorEnvelope(body: unknown): ApiErrorEnvelope | null {
  if (typeof body !== 'object' || body === null) return null;
  const nested = (body as Record<string, unknown>).error;
  if (isErrorEnvelope(nested)) return nested;
  if (isErrorEnvelope(body)) return body;
  return null;
}

async function parseError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body: unknown = await response.json();
      const envelope = extractErrorEnvelope(body);
      if (envelope) {
        return new ApiError(response.status, envelope);
      }
    } catch {
      // fall through to the generic envelope below.
    }
  }
  return new ApiError(response.status, {
    code: response.status === 404 ? 'not_found' : 'internal',
    message: response.statusText || `HTTP ${response.status}`,
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(response.status, {
      code: 'invalid_response',
      message: `Expected JSON from ${response.url || 'API'} but received ${contentType || 'unknown content type'}.`,
    });
  }
  // The body is parsed as `unknown` and surfaced at the caller-declared wire
  // contract `T`. `T` is bound to a ts-rs-generated DTO at every call site
  // (the contract owned by `contracts/generated`), so the projection is the
  // declared transport boundary rather than an unchecked field access — this
  // helper never reads fields off the value itself.
  const body: unknown = await response.json();
  return body as T;
}

async function sendNoContent(
  method: 'DELETE',
  url: string,
  opts: ApiRequestOptions | undefined
): Promise<void> {
  const init: RequestInit = {
    method,
    headers: buildHeaders(method, false, opts),
    credentials: 'same-origin',
  };
  if (opts?.signal) init.signal = opts.signal;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ApiError(
      0,
      {
        code: 'network_error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Failed to reach the API.',
      },
      { cause }
    );
  }
  if (!response.ok) {
    throw await parseError(response);
  }
}

async function send<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown,
  opts: ApiRequestOptions | undefined
): Promise<T> {
  const hasBody = body !== undefined && method !== 'GET';
  const init: RequestInit = {
    method,
    headers: buildHeaders(method, hasBody, opts),
    credentials: 'same-origin',
  };
  if (opts?.signal) init.signal = opts.signal;
  if (hasBody) init.body = JSON.stringify(body);

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ApiError(
      0,
      {
        code: 'network_error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Failed to reach the API.',
      },
      { cause }
    );
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  return readJson<T>(response);
}

export function apiGet<T>(
  url: string,
  opts?: ApiRequestOptions
): Promise<T> {
  return send<T>('GET', url, undefined, opts);
}

export function apiSend<T>(
  url: string,
  body?: unknown,
  opts?: ApiRequestOptions
): Promise<T> {
  return send<T>('POST', url, body, opts);
}

export function apiPut<T>(
  url: string,
  body?: unknown,
  opts?: ApiRequestOptions
): Promise<T> {
  return send<T>('PUT', url, body, opts);
}

export function apiPatch<T>(
  url: string,
  body?: unknown,
  opts?: ApiRequestOptions
): Promise<T> {
  return send<T>('PATCH', url, body, opts);
}

export function apiDelete(
  url: string,
  opts?: ApiRequestOptions
): Promise<void> {
  return sendNoContent('DELETE', url, opts);
}

/**
 * Removal request that carries a JSON confirmation payload (the repos
 * endpoint requires `{ confirm_full_name, delete_storage }`) and parses a
 * typed JSON receipt.
 */
export function apiDeleteWithBody<T>(
  url: string,
  body: unknown,
  opts?: ApiRequestOptions
): Promise<T> {
  return send<T>('DELETE', url, body, opts);
}
