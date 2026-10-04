// blameViewModel.ts — the file text and its blame, laid out as rows.
//
// `/blame` answers hunks (runs of lines last changed by one commit) and each
// of those commits once, so the gutter is drawn from the hunks: the first line
// of a hunk carries the commit, spanning the rest of its lines. Lines the
// server did not blame (a file that grew since, or no blame at all) carry no
// commit and the gutter is simply empty beside them.

import type { BlameCommit, BlameResponse } from '../../api/types/wiki';

import { splitSourceLines } from './sourceViewModel';

export interface BlameGutter {
  commit: BlameCommit;
  /** How many lines this commit's hunk covers, for the cell's `rowSpan`. */
  lines: number;
}

export interface BlameRow {
  /** 1-based line number. */
  line: number;
  text: string;
  /** Set on the first line of a hunk; the lines below it are covered by it. */
  gutter: BlameGutter | null;
}

export interface BlameLines {
  rows: BlameRow[];
  /** Lines in the whole file. */
  total: number;
  /** True when `rows` stops at the line cap. */
  truncated: boolean;
}

export function blameRows(text: string, blame: BlameResponse | undefined): BlameLines {
  const source = splitSourceLines(text);
  const byLine = new Map<number, BlameGutter>();
  if (blame) {
    const bySha = new Map(blame.commits.map((commit) => [commit.sha, commit]));
    for (const hunk of blame.hunks) {
      const commit = bySha.get(hunk.commit);
      if (!commit || hunk.line_count < 1) continue;
      byLine.set(hunk.start_line, { commit, lines: hunk.line_count });
    }
  }
  // A hunk that starts beyond the cap is dropped with its lines; one that
  // crosses it keeps only the lines shown.
  const rows = source.lines.map((text, index) => {
    const line = index + 1;
    const gutter = byLine.get(line);
    return {
      line,
      text,
      gutter: gutter
        ? { commit: gutter.commit, lines: Math.min(gutter.lines, source.lines.length - index) }
        : null,
    };
  });
  return { rows, total: source.total, truncated: source.truncated };
}
