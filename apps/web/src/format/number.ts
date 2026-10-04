// number.ts — the one number formatter for the web UI.
//
// Counts are grouped the same way everywhere ("12,480 lines"), so a page never
// mixes a grouped total with a bare one.

/** A count, thousands grouped: `12,480`. Anything unreadable reads as `—`. */
export function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
