# Rendered UX QA Evidence

This file records the rendered UX proof surface for `apps/web`.

## Required lanes

- Storybook state coverage for loading, empty, error, success, and permission-denied states.
- Playwright screenshot capture with `page.screenshot`, `locator.screenshot`, `artifactPath`, and `ariaSnapshot`.
- Visual review or geometry runtime checks via `@jankurai/ux-qa`, `getBoundingClientRect`, and edge-clearance / target-size assertions.
- Accessibility automation with `axe-core`, `pa11y`, and `storybook-addon-a11y`.
- Layout stability checks with `web-vitals`, CLS, and Lighthouse.
- Generated API mocks with MSW or Orval.
- Design token discipline through `tokens/` and `style-dictionary`.
- Artifact-backed proof receipts in `ux-qa-artifacts/`, `playwright-report/`, and `test-results/`.

## Harness (W-T-19)

`ux-qa-check.mjs` is a real proof collector. Per-run it verifies the following
checks and writes a JSON receipt to `target/jankurai/ux-qa/web-forge.<ISO>.json`
plus a sibling `web-forge.latest.json` symlink-equivalent for downstream tools.

| Check | Verifies |
|---|---|
| `vite_build` | `apps/web/dist/index.html` and `apps/web/dist/assets/` exist. |
| `storybook_build` | `apps/web/storybook-static/index.html` exists. |
| `playwright_report` | `apps/web/playwright-report/index.html` exists. |
| `axe_scans` | Any `*.axe.json` / `playwright-axe-*.json` artifact under `target/jankurai/ux-qa/` has zero `critical` or `serious` violations. |
| `markdown_xss` | `cargo nextest run -p jeryu --test web_markdown_tests` passes; receipt written to `target/jankurai/ux-qa/markdown-xss.json`. |
| `ws_replay` | Playwright HTML report references the `08-ws-reconnect` spec. |
| `bundle_size` | Total gzipped size of every `dist/assets/*.js` file is below 700 KB. |

Each check produces a `{ name, pass, details }` entry in the receipt. The
top-level `pass` is true if and only if every check passes. The harness exits
`0` on full pass; non-zero exit codes surface in CI as a hard failure with a
human-readable summary printed to stderr.

If a check fails because the upstream artifact is not yet produced (e.g. the
Playwright report is missing because the e2e suite did not run), the harness
still writes the receipt with `pass: false` plus a `reason:` and a `hint:`
indicating which command to run next.

## Storybook story coverage (W-T-07)

The Storybook build emits stories for the components in the §6.14 matrix:

- `RepoCard` — healthy / warning / critical / archived / private.
- `ReadmePanel` — loading / empty / rendered / malicious-HTML-sanitized.
- `DiffViewer` — small / huge / binary / generated / with-comments.
- `MergeGatePanel` — pass / blocked / stale-SHA / approval-required / agent-evidence.
- `SettingsDiffPreview` — safe / reversible / irreversible / production-impact.
- `RiskBadge` — low / medium / high / critical.
- `CommandPalette` — closed / open-empty / open-typing / open-many.

The addon-a11y panel scans every story; critical / serious violations are
surfaced in the panel and gate CI when CI runs `storybook test-runner`.

## Perf budget (W-T-20)

`apps/web/perf/lighthouse.config.js` plus `lighthouse-budget.json` define the
Lighthouse CI run executed by `npm --workspace @jeryu/web run perf`. The
budgets mirror Appendix D in `WEB_WORK_CLAUDE.md`:

| Resource type | Budget (KB) |
|---|---:|
| script | 358 |
| stylesheet | 30 |
| image | 100 |
| document | 18 |
| total | 600 |

Timing thresholds:

| Metric | Budget (ms) |
|---|---:|
| first-contentful-paint | 1500 |
| interactive | 3000 |
| speed-index | 2000 |

If `@lhci/cli` is not installed (lockfile-only environment), install it with
`npm install --workspace @jeryu/web @lhci/cli@latest` and re-run the script.

## Rendered surfaces

New product surfaces join the rendered lane with three pieces of evidence:
an axe scan plus `persistRenderedEvidence` (screenshot + geometry + design
tokens) in `apps/web/e2e/10-a11y.spec.ts`, shared browser-boundary API mocks
under `apps/web/e2e/fixtures/`, and a Playwright screenshot from the route spec.

| Surface | Scope | Mocks | Route spec |
|---|---|---|---|
| `/runners` (one sentence for the gate network; rows say Runner, Now, Last job, Seen; PR reviewers share the shape, and a missing reviewer is said) | `fleet` | `mocks.ts` (`mockFleetBootstrap`) | `11-fleet.spec.ts` |
| `/repos` Status column: a red chip opens the failing checks and what to do, in place; Mirror, Unshipped and Failing CI columns removed | `repositories`, `repositories-status` | `mocks.ts` (`mockRepoList`) | `27-repos-status.spec.ts`, `02-repos.spec.ts` |
| Repository Settings, read-only: branch protection and the GitHub mirror | `repo-settings` | `mocks.ts` (`mockRepoList`) | `31-repo-settings-readonly.spec.ts` |
| `/work` (one page: a one-line Add work composer that opens when used, a one-line workers summary that opens to the slots, timeline and capacity chart, then every family's queue with a family pill at the far left of each row; `/work/shift`, `/work/shift/new` and `/work/shift/workers` redirect to it, to `#add` and to `#workers`, query string kept) | `shift-queue` (as it opens), `shift-add` (composer opened), `shift-workers` (workers opened) | `shiftMocks.ts` (two families) | `28-shift.spec.ts` |
| `/releases` (environments: what each one runs, and Ready to pin; it links to the timeline instead of listing pull requests, and `/unreleased` redirects here because the forge still emits that path) | `releases` | `releaseFixtures.ts`, `pipelineMocks.ts` (pins) | `26-releases.spec.ts`, `29-pipeline.spec.ts` (Ready to pin) |
| `/pull-room` (the timeline: shift work with no PR yet, open rows, then merged work banded by release channel down to a collapsed production band) | `pull-requests`, `pull-requests-bands` | `pullRoomMocks.ts`, `releaseChannelMocks.ts` | `14-pull-room.spec.ts`, `29-pull-timeline-release.spec.ts` |
| Shell chrome on every page: skip link, home logo, the search-or-jump palette (pages, repositories, `name#n`), the left nav's System disclosure, header at 900 and 480 px | `shell-chrome` | `mocks.ts` (`mockRepoList`), `pipelineMocks.ts` | `25-action-matrix.spec.ts`, `13-left-nav.spec.ts`, `29-pipeline.spec.ts` (narrow), `10-a11y.spec.ts` (palette + System open) |
| The one repository page: `/repos/:host/:owner/:repo` (README) and `…/blob/<ref>/<path>` (a file) share a layout with a Files panel on the right that stays while files open; `/code`, `/work` and `/issues` redirect to it | `repo-overview`, `repo-file` | `mocks.ts` (`mockTreeByPath`, `mockBlob`, `mockReadme`) | `04-code.spec.ts`, `20-repo-routing.spec.ts` |
| `/needs-you`, `/activity`, `/activity?wall=1` (and the live dock on every page) | `needs-you`, `activity`, `activity-wall` | `pipelineMocks.ts` | `29-pipeline.spec.ts` |

UX pass 1 (2026-09-19, from a walk of the live site) changed what these specs
assert rather than adding surfaces: the blob view is a plain numbered source
view with `#L<n>` anchors (`04-code.spec.ts`; the Monaco editor it replaced was
fetched from a CDN the site's CSP refuses, so files never loaded); Work > Queue
shows live todos and shifts and folds finished ones and the filters
(`28-shift.spec.ts`); Activity rows read in plain words with chips for views,
and the dock is one line until opened and absent on `/activity`
(`29-pipeline.spec.ts`); repository removal lives under Settings > Danger zone
(`22-repo-danger-zone.spec.ts`); the header names the repository and links to
the list (`25-action-matrix.spec.ts`). `/search` is gone: no server route ever
backed it.

Work (`/work`, 2026-09-19, owner request): the Queue, Add and Workers tabs are
one page, so there is one place to look and one obvious thing to do. Add work
is first: a family select (the active filter's family, else the first), Night
before Now with Night the default, one line, and one filled button that waits
for text; stepping into the line or pressing More opens the full form in place,
and filing collapses and clears it and highlights the new todo in the queue.
Under it one line says how many slots are healthy, who is working on what (each
linked to its todo) and how many are paused, with a 24 h sparkline; it takes a
warning tone only when a slot that should be up is not, and its open state is
remembered. The queue shows every family; the family pill at the far left of a
row, or the counted strip above, filters the whole page through `?family=`, and
the same pill again, or All, clears it. The palette has "Go to Work" and "Add
work" (`28-shift.spec.ts`).

Pull requests (`/pull-room`, 2026-09-19, owner request): the page is the same
Opened > Checks > Review > Mergeable > Merged timeline the per-repo page shows,
one row per open pull request across every repository, led by `owner/name#n`;
the lane board is behind the Timeline / Board toggle (`?view=board`, or the older
`queue`). Family pills with counts filter through `?family=` (a repo with no
family is "other"); three stat tiles became one sentence. `14-pull-room.spec.ts`
covers the default timeline, the filters, the board, the pills and the back
button and a repo whose list fails (one quiet line, never a page error);
`10-a11y.spec.ts` scans it (`pull-requests.axe.json` with rendered evidence).
