// number.ts — the one number formatter for the web UI.
//
// Counts are grouped the same way everywhere ("12,480 lines"), so a page never
// mixes a grouped total with a bare one. A count that is shown in several
// places at once — "needs you" on the nav badge, in the live dock and in
// Activity's note — goes through `formatBadgeCount`, so the three agree
// instead of one saying "99+" and the next "100".

/** A count, thousands grouped: `12,480`. Anything unreadable reads as `—`. */
export function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

/** Past this, a count reads as "more than this" rather than its own number. */
export const COUNT_BADGE_CAP = 99;

/**
 * A count said beside the thing it counts: `12`, `99+` once it passes the cap.
 * A badge has room for two digits and a reader only needs "a lot" past them,
 * so the cap is the same wherever the number appears.
 */
export function formatBadgeCount(
  value: number | null | undefined,
  cap: number = COUNT_BADGE_CAP
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value > cap ? `${formatCount(cap)}+` : formatCount(value);
}
