# Changelog

## Unreleased
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
