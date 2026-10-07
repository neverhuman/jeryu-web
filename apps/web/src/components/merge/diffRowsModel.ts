// diffRowsModel.ts — the rows the DiffViewer draws, in either layout.
//
// Unified is one row per diff line. Split puts the base on the left and the
// head on the right: context lines sit on both sides, and each run of
// deletions is paired line for line with the run of additions that follows
// it, so a changed line reads across. The longer run leaves its partner side
// empty.

import type { PullRequestDiffHunk } from '../../api/types';

export interface DiffRow {
  /** Flattened key for React. */
  key: string;
  /** Hunk header (purely informational) or a normal diff line. */
  kind: 'hunk' | 'context' | 'add' | 'del';
  /** Base (left) line number. */
  baseLine: number | null;
  /** Head (right) line number. */
  headLine: number | null;
  /** Raw line text without the leading prefix. */
  text: string;
}

/** One side of a split row: a line number and its text, or nothing. */
export interface SplitSide {
  kind: 'context' | 'add' | 'del';
  line: number;
  text: string;
}

export type SplitRow =
  | { key: string; kind: 'hunk'; text: string }
  | {
      key: string;
      kind: 'pair';
      left: SplitSide | null;
      right: SplitSide | null;
    };

export function flattenHunks(hunks: PullRequestDiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (let h = 0; h < hunks.length; h += 1) {
    const hunk = hunks[h]!;
    rows.push({
      key: `h${h}:${hunk.header}`,
      kind: 'hunk',
      baseLine: null,
      headLine: null,
      text: hunk.header
    });
    let baseLine = hunk.old_start;
    let headLine = hunk.new_start;
    for (let i = 0; i < hunk.lines.length; i += 1) {
      const line = hunk.lines[i]!;
      const prefix = line[0] ?? ' ';
      const text = line.slice(1);
      if (prefix === '+') {
        rows.push({
          key: `${h}:+${headLine}:${i}`,
          kind: 'add',
          baseLine: null,
          headLine,
          text
        });
        headLine += 1;
      } else if (prefix === '-') {
        rows.push({
          key: `${h}:-${baseLine}:${i}`,
          kind: 'del',
          baseLine,
          headLine: null,
          text
        });
        baseLine += 1;
      } else {
        rows.push({
          key: `${h}: ${headLine}:${i}`,
          kind: 'context',
          baseLine,
          headLine,
          text
        });
        baseLine += 1;
        headLine += 1;
      }
    }
  }
  return rows;
}

/** Lay unified rows out side by side, pairing each deletion run with its additions. */
export function splitRows(rows: DiffRow[]): SplitRow[] {
  const out: SplitRow[] = [];
  let dels: DiffRow[] = [];
  let adds: DiffRow[] = [];
  const flush = (): void => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i += 1) {
      const del = dels[i];
      const add = adds[i];
      out.push({
        key: `p:${del?.key ?? ''}|${add?.key ?? ''}`,
        kind: 'pair',
        left: del ? { kind: 'del', line: del.baseLine!, text: del.text } : null,
        right: add ? { kind: 'add', line: add.headLine!, text: add.text } : null
      });
    }
    dels = [];
    adds = [];
  };
  for (const row of rows) {
    if (row.kind === 'del') {
      // A deletion after additions starts a new change.
      if (adds.length > 0) flush();
      dels.push(row);
    } else if (row.kind === 'add') {
      adds.push(row);
    } else {
      flush();
      if (row.kind === 'hunk') {
        out.push({ key: row.key, kind: 'hunk', text: row.text });
      } else {
        out.push({
          key: row.key,
          kind: 'pair',
          left: { kind: 'context', line: row.baseLine!, text: row.text },
          right: { kind: 'context', line: row.headLine!, text: row.text }
        });
      }
    }
  }
  flush();
  return out;
}
