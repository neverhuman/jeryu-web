// idempotency.ts — the one `Idempotency-Key` the mutating hooks send.
//
// Every mutation the backend gates on the header (§35.1.3) takes a fresh key
// per attempt, so a retry of the same click is not a second action. One
// implementation keeps the fallback format from forking.

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idempotency-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
