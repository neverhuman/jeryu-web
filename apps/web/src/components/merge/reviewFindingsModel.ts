// reviewFindingsModel.ts — which review tables are findings tables, and the
// columns they keep once Where folds into Finding.

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
