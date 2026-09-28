// index.ts — the release board fixtures from the 2026-09-28 audit (real
// data, the exact shape the collector emits), typed for tests. The JSON files
// are the contract's fixtures copied as-is; the e2e mocks read the same files.

import type {
  ReleaseBoard,
  ReleaseBoardListEntry,
  ReleaseBoardListResponse,
} from '../../../api/types/releaseBoard';
import jainJson from './fixture-jain.json';
import jeryuJson from './fixture-jeryu.json';
import veoxJson from './fixture-veox-ai.json';

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

export const VEOX_AI_BOARD = board(veoxJson);
export const JERYU_BOARD = board(jeryuJson);
export const JAIN_BOARD = board(jainJson);

export const ALL_BOARDS: ReleaseBoard[] = [JAIN_BOARD, JERYU_BOARD, VEOX_AI_BOARD];

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
