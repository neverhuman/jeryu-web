// FamilyPills.tsx — the family a row belongs to, as a pill that filters.
//
// Needs you and Work list things from every family on one page. Each row wears
// its family at the far left; pressing the pill keeps that family's rows, and
// pressing it again (or "All" in the strip above the list) shows every family.
// One look and one behaviour on both pages.

import { Link } from 'react-router-dom';

import './FamilyPills.css';

export interface FamilyCountEntry {
  family: string;
  count: number;
}

/** The pill at the far left of a row. `picked` is the active filter ('' = all). */
export function FamilyPill({
  family,
  picked,
  onPick,
  className,
}: {
  family: string;
  picked: string;
  onPick: (family: string) => void;
  className?: string;
}): JSX.Element {
  const active = picked === family;
  return (
    <button
      type="button"
      className={`family-pill family-pill--row${className ? ` ${className}` : ''}`}
      aria-pressed={active}
      aria-label={active ? `Showing only ${family}: show every family` : `Show only ${family}`}
      title={active ? 'Show every family' : `Show only ${family}`}
      onClick={() => onPick(family)}
    >
      {family}
    </button>
  );
}

/**
 * One pill per family where exactly one is always shown (no "All"): the
 * release board picks the family whose board it draws. With `hrefOf` each
 * pill is a link to that family's address (the picked one is the current
 * page) and `onPick` still runs on the click, e.g. to remember the pick.
 */
export function FamilyPicker({
  families,
  family,
  onPick,
  label,
  hrefOf,
}: {
  families: string[];
  family: string;
  onPick: (family: string) => void;
  label: string;
  hrefOf?: (family: string) => string;
}): JSX.Element {
  return (
    <div className="family-strip" role="group" aria-label={label}>
      {families.map((entry) =>
        hrefOf ? (
          <Link
            key={entry}
            to={hrefOf(entry)}
            className="family-pill"
            aria-current={family === entry ? 'page' : undefined}
            onClick={() => onPick(entry)}
          >
            {entry}
          </Link>
        ) : (
        <button
          key={entry}
          type="button"
          className="family-pill"
          aria-pressed={family === entry}
          onClick={() => onPick(entry)}
        >
          {entry}
        </button>
        )
      )}
    </div>
  );
}

/** "All" plus one pill per family, each with its count. */
export function FamilyStrip({
  counts,
  family,
  onPick,
}: {
  counts: FamilyCountEntry[];
  family: string;
  onPick: (family: string) => void;
}): JSX.Element {
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <div className="family-strip" role="group" aria-label="Filter by family">
      <button
        type="button"
        className="family-pill"
        aria-pressed={family === ''}
        onClick={() => onPick('')}
      >
        All <span className="family-pill__count">{total}</span>
      </button>
      {counts.map((entry) => (
        <button
          key={entry.family}
          type="button"
          className="family-pill"
          aria-pressed={family === entry.family}
          onClick={() => onPick(entry.family)}
        >
          {entry.family} <span className="family-pill__count">{entry.count}</span>
        </button>
      ))}
    </div>
  );
}
