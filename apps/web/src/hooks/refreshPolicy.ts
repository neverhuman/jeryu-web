// refreshPolicy.ts — one data-refresh policy for the pages an operator watches.
//
// Pages that answer "what is happening right now" — Needs you, Activity, Work,
// In flight, Releases, Runners, Intelligence, the quality gate, shared tools —
// are read again when the tab regains focus, because the reader coming back to
// it expects now, not whenever they last looked. The age of what is on screen
// is never a guess: every one of those pages carries the freshness stamp in its
// PageHeader, fed by the same query's `dataUpdatedAt`.
//
// Reads of something immutable or slow-moving (a commit, a blob, a rendered
// README) keep their own options: refetching them on focus buys nothing.

/** Spread into a `useQuery` for an operator read; explicit options still win. */
export const OPERATOR_REFRESH = {
  staleTime: 15_000,
  refetchOnWindowFocus: true,
} as const;
