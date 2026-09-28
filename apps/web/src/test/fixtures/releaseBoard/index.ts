// index.ts — the release board fixtures, typed for tests. Three invented
// families (acme, globex, initech) in the exact shape the collector emits:
// a parallel stage, target skew, a never-deployed stage, a read-only lane
// shared from another family, and pins. The e2e mocks read the same files.

import type {
  ReleaseBoard,
  ReleaseBoardListEntry,
  ReleaseBoardListResponse,
} from '../../../api/types/releaseBoard';
import acmeJson from './fixture-acme.json';
import globexJson from './fixture-globex.json';
import initechJson from './fixture-initech.json';

function isReleaseBoard(value: unknown): value is ReleaseBoard {
  if (typeof value !== 'object' || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return (
    record['schema'] === 'jeryu.release_board.v1' &&
    typeof record['family'] === 'string' &&
    Array.isArray(record['lanes'])
  );
}

function board(value: unknown): ReleaseBoard {
  if (!isReleaseBoard(value)) throw new Error('fixture is not a jeryu.release_board.v1 snapshot');
  return value;
}

export const ACME_BOARD = board(acmeJson);
export const GLOBEX_BOARD = board(globexJson);
export const INITECH_BOARD = board(initechJson);

export const ALL_BOARDS: ReleaseBoard[] = [ACME_BOARD, GLOBEX_BOARD, INITECH_BOARD];

/** A list entry for `GET /api/v1/release-board`, as the server derives it. */
export function listEntry(snapshot: ReleaseBoard): ReleaseBoardListEntry {
  return {
    family: snapshot.family,
    observed_at: snapshot.observed_at,
    accepted_at: snapshot.observed_at,
    summary: snapshot.summary,
    collector: snapshot.collector,
    problem_count: snapshot.problems.length,
  };
}

/** The list response, sorted by family like the server's. */
export function listResponse(boards: ReleaseBoard[] = ALL_BOARDS): ReleaseBoardListResponse {
  return {
    boards: [...boards]
      .sort((a, b) => a.family.localeCompare(b.family))
      .map(listEntry),
  };
}
