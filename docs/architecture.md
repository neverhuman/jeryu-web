# Architecture

`jeryu-web` is part of the Jeryu split family.

The public portal is `neverhuman/jeryu`. Release authority remains
`neverhuman/jeryu-deploy`; split member repositories own bounded product
surfaces and consume sibling crates from pinned public Git tags.

## Boundaries

- Profile: `node-frontend`
- Required check: `jeryu-web/required`
- Local release source of truth: `agent/boundaries.toml`

## Owned Surface

- `apps/web/**`
- `ux-qa/**`
- `packages/ux-qa/**`
- `contracts/generated/**`
- `contracts/AGENTS.md`
- `package.json`
- `tsconfig.json`

## External-origin work and execution plans

In-flight and Flow optionally consume `external_work` from `GET /api/v1/flow`.
These dated passive observations are independent of native lifecycle events.
In-flight displays external branch heads, ahead/behind comparisons, linked pull
requests and their separate states. Squash-merged branches are not unfinished
merely because their refs compare ahead of the default branch.

Flow displays the entire external plan even when native Queue has no events:
execution waves, parent/follow-up rows, independent milestone memberships,
critical-path markers, prerequisite waits, explicit human decisions and evidence
links. Merged implementation does not certify milestone qualification. Unknown
phases stay unassigned; source observation times remain visible separately for
receipts and origin branches. Browser components never contact the provider,
dispatch work or synthesize lifecycle events.

Wire types are in `apps/web/src/api/types/externalWork.ts`; the model and
renderers are in `apps/web/src/pages/flow/`. The rendered proof in
`e2e/59-external-work.spec.ts` includes keyboard operation, screenshots and axe.
An operator can supply an authorized capture through
`EXTERNAL_WORK_PREVIEW_FILE`; private capture contents never belong in this
public repository.

## Docs

- `boundaries.md` — owned seams and the `agent/boundaries.toml` manifest.
- `generated-zones.md` — the `contracts/generated/**` mirror rules.
- `testing.md` — proof lanes and the `jeryu-web/required` check.
- `release.md` — the release control surface and rollback guidance.
- `audit-rubric.md` — how the jankurai audit scores this repo.
