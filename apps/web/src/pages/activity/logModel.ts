// logModel.ts — a log tail as lines, with the ones worth reading marked.
//
// A tail is a few hundred lines of a gate run, and the reader opening it is
// looking for one thing: what went wrong. So the tail is split into lines and
// each line is asked whether it says so — `error`, `failed`, `panicked`, or a
// shouted `FAIL` — and the few that do carry the danger tone, while the rest
// stay plain. Marking every line would mark nothing.
//
// The three words match whatever their case, because a runner writes `Error:`
// as readily as `error[E0432]`. `FAIL` is only matched shouted: uppercase is
// how a test runner reports a verdict (`FAIL`, `FAILURE`), while a lowercase
// `fail` turns up in prose and in counts that passed ("0 failures").

/** One line of a tail, and whether it is one of the lines to look at. */
export interface LogLine {
  /** The line as the producer wrote it, without its newline. */
  text: string;
  /** The line says something went wrong: shown in the danger tone. */
  bad: boolean;
}

const SPELLED_OUT = /error|failed|panicked/i;
const SHOUTED = /FAIL/;

/** Whether one line of a tail is reporting a failure. */
export function isBadLine(text: string): boolean {
  return SPELLED_OUT.test(text) || SHOUTED.test(text);
}

/**
 * A tail as lines. The trailing newline a log almost always ends with is not a
 * line of its own, so it does not add an empty row under the last one.
 */
export function logLines(tail: string): LogLine[] {
  const body = tail.endsWith('\n') ? tail.slice(0, -1) : tail;
  return body.split('\n').map((text) => ({ text, bad: isBadLine(text) }));
}

/** How many of a tail's lines report a failure: what a reader is told is there. */
export function badLineCount(lines: LogLine[]): number {
  return lines.filter((line) => line.bad).length;
}
