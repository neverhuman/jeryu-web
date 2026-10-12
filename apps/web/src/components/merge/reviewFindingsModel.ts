// reviewFindingsModel.ts — which review tables are findings tables, the
// columns they keep once Where folds into Finding, where a Where cell points,
// and the repair of table rows whose escaped pipes split a cell.

export interface FindingsLayout {
  /** Index of the Finding column. */
  finding: number;
  /** Index of the Where column, shown at the top of each finding. */
  where: number;
  /** Columns still drawn, in order; Where is left out. */
  columns: number[];
}

/** The layout for a table with these header labels, or null to leave it alone. */
export function findingsLayout(headers: readonly string[]): FindingsLayout | null {
  const labels = headers.map((label) => label.trim().toLowerCase());
  const finding = labels.findIndex((label) => label === 'finding' || label === 'findings');
  const where = labels.indexOf('where');
  if (finding < 0 || where < 0) return null;
  const columns = labels.map((_, index) => index).filter((index) => index !== where);
  return { finding, where, columns };
}

/** A Where cell read as a file of the diff: `path` or `path:line[-end]`. */
export interface FindingLocation {
  path: string;
  line: number | null;
}

const LOCATION = /^([^\s:`|]+?)(?::(\d+)(?:-\d+)?)?$/;

/** The file a Where cell names, or null when it names no single file. */
export function findingLocation(text: string): FindingLocation | null {
  const match = LOCATION.exec(text.trim());
  if (!match) return null;
  const [, path, line] = match;
  if (!line && !/[./]/.test(path)) return null;
  return { path: path.replace(/^\.\//, ''), line: line ? Number(line) : null };
}

/**
 * Reviewers write a pipe inside a code span in a table row as `\\|`. GFM
 * reads that as an escaped backslash followed by a cell break, so the row
 * splits mid-sentence and the rest of the finding lands in the Where column.
 * Inside code spans on table rows `\\|` becomes `\|`, which GFM shows as `|`.
 * Fenced code and every other line are left alone.
 */
export function repairTablePipes(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const opener = /^\s*(`{3,}|~{3,})/.exec(line);
      if (opener) {
        if (fence === null) fence = opener[1];
        else if (opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
        return line;
      }
      if (fence !== null || !line.trimStart().startsWith('|') || !line.includes('\\\\|')) return line;
      return repairCodeSpans(line);
    })
    .join('\n');
}

function repairCodeSpans(line: string): string {
  let out = '';
  let index = 0;
  while (index < line.length) {
    const tick = line.indexOf('`', index);
    if (tick < 0) break;
    let run = tick;
    while (line[run] === '`') run += 1;
    const ticks = line.slice(tick, run);
    const close = findClosingRun(line, run, ticks.length);
    if (close < 0) {
      out += line.slice(index, run);
      index = run;
      continue;
    }
    out += line.slice(index, run) + line.slice(run, close).split('\\\\|').join('\\|') + ticks;
    index = close + ticks.length;
  }
  return out + line.slice(index);
}

function findClosingRun(line: string, from: number, length: number): number {
  let index = from;
  while (index < line.length) {
    const tick = line.indexOf('`', index);
    if (tick < 0) return -1;
    let run = tick;
    while (line[run] === '`') run += 1;
    if (run - tick === length) return tick;
    index = run;
  }
  return -1;
}
