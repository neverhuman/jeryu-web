// fleet/releaseIndex.ts — "what it is and where it is": which release-board
// lane each runner belongs to, and which lane the forge itself is.
//
// A board stage target may name the runners it covers (`runners`, ids exactly
// as /runners reports them). Reading every family's board once gives an index
// runnerId -> lane, so a runner row can link to the lane that ships its code.
// An older collector sends no `runners` and then the index is empty and no
// row grows a link. The forge's header line links to the first production
// stage whose version starts with the forge's own short commit.

import type { ForgeBuild } from '../../api/types/controlPlane';
import type { ReleaseBoard } from '../../api/types/releaseBoard';
import { releaseLaneHref } from '../releaseBoard/links';

export interface RunnerRelease {
  family: string;
  laneId: string;
  laneName: string;
  stageName: string;
  stageVersion: string | null;
}

/**
 * runnerId -> the lane and stage whose target names it. A lane a family owns
 * wins over the same lane shown read-only on another family's board; among
 * equals, the first board and lane in order win.
 */
export function runnerReleaseIndex(
  boards: readonly ReleaseBoard[]
): ReadonlyMap<string, RunnerRelease> {
  const owned = new Map<string, RunnerRelease>();
  const shared = new Map<string, RunnerRelease>();
  for (const board of boards) {
    for (const lane of board.lanes) {
      const into = lane.read_only ? shared : owned;
      for (const stage of lane.stages) {
        for (const target of stage.targets) {
          for (const runnerId of target.runners ?? []) {
            if (into.has(runnerId)) continue;
            into.set(runnerId, {
              family: board.family,
              laneId: lane.id,
              laneName: lane.name,
              stageName: stage.name,
              stageVersion: stage.version,
            });
          }
        }
      }
    }
  }
  for (const [runnerId, release] of shared) {
    if (!owned.has(runnerId)) owned.set(runnerId, release);
  }
  return owned;
}

/**
 * The link's words: "acme · Gate runner · installed v1.2.0". When the runner
 * reports its own version the code line already says it, so the stage
 * version is left out rather than said twice.
 */
export function runnerReleaseText(release: RunnerRelease, codeVersion?: string | null): string {
  const parts = [release.family, release.laneName];
  const showVersion = !codeVersion && release.stageVersion;
  parts.push(showVersion ? `${release.stageName} ${release.stageVersion}` : release.stageName);
  return parts.join(' · ');
}

export function runnerReleaseHref(release: RunnerRelease): string {
  return releaseLaneHref(release.family, release.laneId);
}

export interface ForgeRelease {
  family: string;
  laneId: string;
  laneName: string;
  href: string;
}

/**
 * The lane the forge's own build belongs to: the first lane, on any board,
 * with a stage linked to a `production` forge environment whose version
 * starts with the forge's short commit. Null without a commit or a match.
 */
export function forgeReleaseLane(
  boards: readonly ReleaseBoard[],
  forge: ForgeBuild | null | undefined
): ForgeRelease | null {
  const short = forge?.commit?.slice(0, 7).toLowerCase();
  if (!short || short.length < 7) return null;
  for (const board of boards) {
    for (const lane of board.lanes) {
      const match = lane.stages.some(
        (stage) =>
          stage.forge?.environment === 'production' &&
          (stage.version ?? '').toLowerCase().startsWith(short)
      );
      if (match) {
        return {
          family: board.family,
          laneId: lane.id,
          laneName: lane.name,
          href: releaseLaneHref(board.family, lane.id),
        };
      }
    }
  }
  return null;
}

/** The DOM id of a runner's row: `runner-<slug>`. */
export function runnerAnchorId(runnerId: string): string {
  const slug = runnerId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `runner-${slug || 'unnamed'}`;
}

/** `?runners=a,b` -> ['a', 'b'], blanks and repeats dropped. */
export function parseRunnersParam(value: string | null): string[] {
  if (!value) return [];
  const ids: string[] = [];
  for (const raw of value.split(',')) {
    const id = raw.trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** What a runner row needs to say where it is: its lane, and whether the URL picked it. */
export interface RunnerPlaces {
  releases: ReadonlyMap<string, RunnerRelease>;
  highlighted: ReadonlySet<string>;
}

export const NO_PLACES: RunnerPlaces = { releases: new Map(), highlighted: new Set() };
