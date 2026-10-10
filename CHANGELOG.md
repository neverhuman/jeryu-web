# Changelog

## Unreleased
- A System page, Yield (`/yield`, `g y`, admins only), reads `GET /api/v1/yield` and leads with
  what a merged change cost. Under it: yield, first-pass rate, review share and killed-run spend;
  where the spend went (main, pending, scrap; author, review, triage); each routing experiment's
  arms, held at "not enough data yet" until the server says there is enough; cost per merged
  change by week; a breakdown by model, agent, experiment arm, family, repository, requester or
  week; and the costliest and scrapped todos, each linking to its page. The window (7, 28 or 90
  days) and the cut stay in the address; the family is the shell's scope.
- The signed-out story shows the ink dragon and a waitlist for email, name, and what someone wants from JeRyu. A new address and a repeat share one receipt, the fields clear after it, and a short privacy line sits under the form (wording pending). Those colors stay on that screen. Log in is the same session form, and joining the waitlist does not open an account.
- The account control at the top right is a menu: Settings, the theme, the keyboard shortcuts,
  Help and — at the bottom — Log out. It opens with Enter, Space or ↓, walks with the arrow keys
  and closes on Escape, so logging out no longer means a trip to the foot of Settings, and the
  header names the viewer once instead of saying "Logged in · name" beside a cog.
- The header repository chip is a real switcher: it names the repository you are in and opens a
  typeahead over the rest, the repositories of the family in scope first. Typing part of a name
  and pressing Enter lands on that repository; the list is fetched the first time it is opened.
- There is a Help page (`/help`, `g h`), in the account menu and the palette: the keys, the daily
  pages, which System page answers which question, and where the account controls live.
- Each System page now carries one line of "use this when…" under its title, written once in the
  nav registry beside the label and the chord, so Help and the page say the same sentence.
- One `.form-input` style for text fields the app renders itself; the Search page's box uses it
  rather than the browser's bare line.
- The live activity dock is docked. It is pinned to the foot of the viewport above the status bar
  (collapsed to one line by default, growing upward when opened) instead of sitting at the end of
  the page, where on a long page it was off screen below everything else. Each row is now a link
  to what the event is about — the subject link the Activity page gives it — and the feed is read
  on the page's family, the one the "need you" count beside it already applied.
- Grokbot and Musebot enrollment is covered in the browser. An empty repository
  roster links to add one with that repository already selected. The account
  page shows the enrollment key and setup script only when one is added or
  rotated, and a reload does not invent the key again. Rotate, suspend, and
  revoke update that row. The account page and the roster stay inside a
  390px-wide viewport.
- Every "needs you" count on screen is now one derivation of one list. The nav badge, the live
  activity dock, the Needs you header and each page's "Waiting on you in <area>" strip all count
  `urgentAttention` / `urgentInArea` from `GET /api/v1/attention`: the dock no longer counts
  flagged rows among the last few events (it said 1 beside a badge of 3) and links to
  `/needs-you`, Work no longer counts its own queue but shows the Work share of that list,
  labelled "in Work", with the rows under it, Needs you's family pills count by the same
  severity rule its rows use, and an In flight ghost row wears red when the list names its todo
  rather than deciding from the todo's status. In flight marks each waiting pull request on its
  own row and counts above the list only what no row below carries. Runners shows the strip its
  badge counts (downed workers and gate runners), and a strip's "N more in Needs you" link
  keeps `?family=`.
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
- The pages that ignored the family scope now follow it. Runners keeps the runners a family's
  release-board lane names, plus the ones no lane names (they serve every family); the dependency
  graph, the quality gate's "Failures by repository" and its window totals, a rule's flagged
  heads, Shared tools' pattern families and tool adoption, and Search's results are all narrowed
  by the repository→family map the shell already polls, because none of those endpoints takes a
  `family` yet. Each place says "+N … in other families" with one click back to all of them, so a
  scope never hides the rest of the fleet. Intelligence and the tool-registry Proposals list are
  the same page for every family: the header chip says "All families — this page is not
  per-family" and the scope stays carried, so the next page is scoped again. The left-nav badges
  and the "Needs you" count narrow too, each saying how many wait elsewhere (a muted "+N" where
  nothing in scope waits), and `/` plus the page a login returns to keep the carried family.
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
  is deprecated and its drift fully reconciled.

## jeryu-web-v4.0.0-split.0

- Initial split-family baseline for `jeryu-web`.
