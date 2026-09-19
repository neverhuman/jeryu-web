// sourceViewModel.ts — pure helpers behind the plain read-only source view.
//
// The file view used to mount Monaco, whose loader fetches the editor from a
// CDN that the site's own Content-Security-Policy refuses, so every file sat at
// "Loading…" forever. Reading a file needs lines, numbers and a way to point at
// one; nothing here needs a network.

/** Lines past this are not rendered; the Raw link serves the whole file. */
export const SOURCE_LINE_CAP = 5000;

export interface SourceLines {
  /** The lines to render, without their terminators. */
  lines: string[];
  /** Lines in the whole file. */
  total: number;
  /** True when `lines` stops at the cap. */
  truncated: boolean;
}

/** Split text into display lines. A trailing newline does not add an empty line. */
export function splitSourceLines(text: string, cap: number = SOURCE_LINE_CAP): SourceLines {
  if (text.length === 0) return { lines: [], total: 0, truncated: false };
  const all = text.replace(/\r\n?/g, '\n').split('\n');
  if (all[all.length - 1] === '') all.pop();
  const total = all.length;
  const limit = Math.max(1, Math.floor(cap));
  return total > limit
    ? { lines: all.slice(0, limit), total, truncated: true }
    : { lines: all, total, truncated: false };
}

/** The line a `#L12` fragment points at, or null. */
export function lineFromHash(hash: string): number | null {
  const match = /^#?L(\d{1,7})$/.exec(hash.trim());
  if (!match) return null;
  const line = Number(match[1]);
  return Number.isSafeInteger(line) && line >= 1 ? line : null;
}

/** The fragment that points at `line`. */
export function hashForLine(line: number): string {
  return `#L${line}`;
}

/** DOM id of a rendered line, the target of `#L<n>`. */
export function lineElementId(line: number): string {
  return `L${line}`;
}
