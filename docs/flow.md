# Flow

Flow answers one question: where is the work in progress stuck right now. It is
not a topology map and not a single-change tracer; Activity holds history.

- **Strip.** The nine stations (Queue to Deploy) left to right, one number each:
  what is in progress there now (active, waiting and held together). The station
  the server marks `bottleneck` is flagged. A bar under each number is the
  station's oldest wait against the stale cutoff, full once it is stale. A
  station nothing has reached shows `—`, never a zero.
- **Station.** The station in `?station=` (default: the bottleneck, or the
  station with the most in progress when the bottleneck has none) lists its
  items from `lots[]`, oldest first: the item (a pull request id names its
  repository), how long it has waited, why it is held, by whom and for how long,
  and links to the item, its review and its pull request. `repository_wip[]`
  gives the per-repository counts above the list. Picking a station is a new
  address, so it is linkable and Back returns to the previous station.
- **Stale.** Items at their station longer than `STALE_AFTER_DAYS` (14, in
  `pages/flow/flowModel.ts`) fold into one "N stale" line that lists them on
  click. The report carries no per-item worker evidence, so an "active" claim
  with no live worker is told apart by age only.
- **Honest counts.** The server lists the oldest 20 items per station. When it
  lists fewer than it counts, the page says "N of M listed" for the line and for
  the station, and notes when the topology says families were left out.
- Lists render 50 rows until "Show all"; rows walk with `j`/`k` and open with
  Enter (`useListKeys`). The family comes from the header's family scope.

What is in progress does not depend on a window, so the page reads the server's
default one. Old addresses keep working: `?mode=layout`, `?days=` and the history
parameters are ignored and dropped on the next station pick.

The data contract is owned by jeryu-deploy (`docs/flow.md`, ADR 0004). The page
draws only what the report proves: unknown stays unknown.

Proof: `e2e/52-flow.spec.ts` (strip, default station, stale fold, address and
Back, keyboard, phone dark, nav and refusals) and
`src/pages/__tests__/FlowPage.test.tsx` plus `flowModel.test.ts`.
