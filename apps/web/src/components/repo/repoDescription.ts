// repoDescription.ts — the part of a repository description that tells it
// apart from the others in the same list.
//
// Many repositories carry generated descriptions ("Primary shared Git
// authority (jain)", "Shared Git authority; jekko; needs-owner") that repeat
// down a hundred-row table and say nothing. A description is read as
// `;`-separated segments; a segment that appears on several rows is
// boilerplate and is left out of the cell (the full text stays on hover).

/** A segment on at least this many rows is boilerplate. */
export const REPEATED_SEGMENT_ROWS = 3;

function segments(description: string | null | undefined): string[] {
  if (!description) return [];
  return description
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * For each description in `descriptions`, the segments not shared with
 * `REPEATED_SEGMENT_ROWS` or more rows, keyed by the full description.
 * An empty string means the whole description is boilerplate.
 */
export function distinctDescriptions(
  descriptions: ReadonlyArray<string | null | undefined>
): Map<string, string> {
  const rows = new Map<string, number>();
  for (const description of descriptions) {
    for (const part of new Set(segments(description))) {
      rows.set(part, (rows.get(part) ?? 0) + 1);
    }
  }
  const out = new Map<string, string>();
  for (const description of descriptions) {
    if (!description || out.has(description)) continue;
    const kept = segments(description).filter(
      (part) => (rows.get(part) ?? 0) < REPEATED_SEGMENT_ROWS
    );
    out.set(description, kept.join('; '));
  }
  return out;
}
