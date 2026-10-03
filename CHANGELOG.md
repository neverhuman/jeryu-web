# Changelog

## Unreleased
- The family filter is one shell-wide scope that survives navigation. The header carries a chip
  ("Family: acme ×") with a picker; every left-nav link, every `g x` chord and every palette route
  carries the scope, in whichever form that page states it (`?family=<key>`, or the path
  `/releases/family/<key>`). The URL is authoritative; where an address states no family the tab
  falls back to the one it last chose (session storage, so a second tab can watch a second
  family), and the chip's × or the palette's "Show all families" clears it everywhere. The
  palette also has "Switch family…", which opens the picker. `acme` and `acme-split` resolve to
  one key, so a scope set on one page matches rows on another, and the page title names the
  family while a scope is active.
- Every family-aware page now reads and writes that one scope, so picking a family anywhere sets
  it everywhere and "All" clears it everywhere. The repositories list keeps its family facet in
  the scope and the URL (it survives a reload and Back); Work's strip and row pills, the composer's
  family, a todo page's pill, In flight's family bar, Activity's Family select (and its wall, which
  says which family it counts), Needs you's strip and the strips a page shows above its own
  content, and the release board and its per-repository view (`?view=repositories`) all show and
  set the same family, under either spelling of its name. A link to an item of ANOTHER family
  still opens that item and leaves the scope alone: the chip says "outside acme · switch to
  globex", which is the one click that carries the other family. A scoped page with nothing on it
  says "Nothing for acme here" and offers "Show all families" rather than reading as an outage.
- Releases and Runners point at each other. A family's board is `/releases/family/<family>` (the
  family pills link there; `/releases?family=<family>` redirects, keeping other parameters and the
  hash), and each lane is the anchor `#lane-<id>`, scrolled to and ringed briefly when a URL names
  it. A stage target that names its runners (`runners` on a board target, optional; an older
  collector sends none) links "N runners" to `/runners?runners=<ids>`, which highlights those rows
  and scrolls to the first. Each runner row has the anchor `runner-<slug>` and, when a board names
  it, a second line such as "acme · Gate runner · installed v1.2.0" linking to its lane; the
  forge's own build line links to the lane whose production stage runs its commit. /runners reads
  the boards once and then at most every 5 minutes; boards it cannot read mean no links.
- PR gate: `ops/ci/web-deps.sh` installs the workspace from the root `package-lock.json` before
  any lane runs, so a branch that adds or bumps an npm dependency meets a tree that has it. The
  install is keyed on the lockfile's digest recorded inside `node_modules`, so an unchanged
  lockfile still costs nothing; a member `node_modules` left by an earlier install is cleared
  first, since it would otherwise shadow a bumped version. Two gates sharing a tree install one
  after the other (`flock`), an install the host cannot complete fails there naming the packages
  that do not resolve rather than surfacing as `TS2307` in a later lane, and the Playwright
  browser build is keyed on the version the lockfile pins.
- Markdown views: a ```mermaid fenced block is drawn as a diagram. Mermaid loads only when such a
  block scrolls into view, from its own chunk, with `securityLevel: 'strict'` and `htmlLabels:
  false`; the SVG it produces is sanitized (svg + svgFilters profiles, no foreignObject, no
  script, no event attributes) and inserted as nodes, never as markup. The diagram is announced
  as an image labelled from its `title:` directive or first line and keeps its source behind a
  "Source" toggle. A source that will not parse, a render that runs long, or one larger than
  50 KB shows the code block plus a short note saying why.
- Repository page: an Automation section says what runs on the repository — the forge's checks
  with what each last concluded (and every required context that has never reported), the
  reviewer and merge identities with whether their grants exist (a merger without its write
  grant is called out, because its merges answer 403), the gate runners and deployers that
  reported, and who holds which access. A Mirrors section says where the repository is copied
  to, which refs travel, the sha the target holds, and whether it is behind the forge. Both read
  `GET /api/v1/repos/{id}/automation`; a forge without that route leaves the rest of the page
  alone.
- Releases: `/releases` opens on the family release board (`jeryu.release_board.v1`, admin-only):
  one lane per deliverable with its stages, what each stage runs on every target and how that is
  known, the promote command to copy, a "Work reached" bar, and "Pinned vs released" and
  "Release notes" views. A deployment the forge reports after the snapshot shows at once; a
  snapshot older than 15 minutes is flagged. The per-repository view stays at `?repo=owner/name`
  (and `?view=repositories&family=<name>`), and is shown under a note when there is no board.
- Runners: an Automation section lists the forge's background timers (auto-pin, auto-stage) from
  their `automation`-labelled heartbeats: which timer, where, what it last did (with the one pull
  request link when there is one) and when it was last seen. A timer is offline by the forge's
  `offlineAfterSeconds`, reads as a problem and says since when; with no timer reporting there is
  no section. `lastActivity.pr` may be null (a staged commit has no pull request).
- Web: high-contrast multi-neon TUI overhaul — boot splash + moving feature
  carousel + keyboard-first login; the dark terminal theme is the new default
  (light and high-contrast still selectable); self-hosted JetBrains Mono.
- Docs: added `docs/boundaries.md`, `docs/generated-zones.md`,
  `docs/audit-rubric.md`, and `agent/standard-version.toml` for family parity.
- Release: `VERSION` now tracks the split tag (`jeryu-web-v5.0.0-split.1`) and
  is stamped by `scripts/stamp-version.sh` during the release instead of by
  hand; a test fails if it falls behind the newest tag.
- v5.0.0 split baseline live on the local forge; merge-to-GitHub mirror verified.

## jeryu-web-v5.0.0-split.0 - 2026-06-11
- MAJOR: first standalone split-family release; the legacy monorepo
  (/home/ubuntu/jeryu) is deprecated and its drift fully reconciled.

## jeryu-web-v4.0.0-split.0

- Initial split-family baseline for `jeryu-web`.
