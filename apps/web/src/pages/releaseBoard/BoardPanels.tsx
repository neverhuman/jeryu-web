// BoardPanels.tsx — the parts of a family release board besides its lanes:
// the "Not shipped yet" banner, the "Work reached" bar, the pinned-vs-released
// table, the release notes, and the sources the collector could not read.

import { useId } from 'react';

import type {
  BoardNotes,
  BoardPins,
  BoardProblem,
  BoardWork,
  ReleaseBoard,
} from '../../api/types/releaseBoard';
import { laneAnchorId } from './links';
import {
  pillClass,
  pinBehindState,
  pinColumns,
  unshipped,
  unshippedHeadline,
  unshippedPinsText,
  workShares,
  workShareText,
  workSummary,
} from './model';

/** Every todo placed at the furthest point it reached, as one stacked bar. */
export function WorkBar({ work }: { work: BoardWork }): JSX.Element {
  const headingId = useId();
  const shares = workShares(work);
  return (
    <section
      className="release-board__work"
      aria-labelledby={headingId}
      data-testid="release-board-work"
    >
      <div className="release-board__lane-head">
        <h3 className="release-board__lane-name" id={headingId}>
          Work reached
        </h3>
        <span className="release-board__muted">
          {work.total} todo{work.total === 1 ? '' : 's'} in the queue
        </span>
      </div>
      <div className="release-board__bar" role="img" aria-label={workSummary(work)}>
        {shares
          .filter((share) => share.count > 0)
          .map((share) => (
            <span
              key={share.key}
              className={`release-board__bar-part release-board__work--${share.key}`}
              style={{ width: `${share.width}%` }}
              title={workShareText(share)}
            />
          ))}
      </div>
      <ul className="release-board__legend" aria-label="Work reached, by where it stopped">
        {shares.map((share) => (
          <li key={share.key} data-testid={`release-board-work-${share.key}`}>
            <span
              className={`release-board__swatch release-board__work--${share.key}`}
              aria-hidden="true"
            />
            {share.label}{' '}
            <strong>
              {share.count} ({share.percent}%)
            </strong>
          </li>
        ))}
      </ul>
      <p className="release-board__muted">{work.method}</p>
      {work.unlinked ? <p className="release-board__muted">{work.unlinked}</p> : null}
    </section>
  );
}

/** What each repo's main has, what is pinned, what runs, and how far behind. */
export function PinsTable({ pins }: { pins: BoardPins }): JSX.Element {
  const columns = pinColumns(pins);
  return (
    <div className="release-board__panel" data-testid="release-board-pins">
      <p className="release-board__muted">{pins.note}</p>
      <div className="table-scroll">
        <table className="release-board__table">
          <caption className="sr-only">Pinned against released, per repository</caption>
          <thead>
            <tr>
              <th scope="col">{columns.repo}</th>
              {columns.cells.map((column, index) => (
                <th scope="col" key={`${index}-${column}`}>
                  {column}
                </th>
              ))}
              <th scope="col" className="release-board__num">
                {columns.behind}
              </th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {pins.rows.map((row) => (
              <tr key={row.repo} data-testid={`release-board-pin-${row.repo}`}>
                <th scope="row">{row.repo}</th>
                {columns.cells.map((_, index) => (
                  <td key={index}>
                    <code>{row.cells[index] ?? ''}</code>
                  </td>
                ))}
                <td className="release-board__num">
                  <span className={pillClass(pinBehindState(row.behind))}>
                    {row.behind === null ? 'unknown' : row.behind}
                  </span>
                </td>
                <td className="release-board__muted">{row.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NotesPanel({ notes }: { notes: BoardNotes | undefined }): JSX.Element {
  if (!notes) {
    return (
      <p className="page__roadmap-note" data-testid="release-board-notes">
        This family's collector sends no release notes yet.
      </p>
    );
  }
  return (
    <div className="release-board__panel" data-testid="release-board-notes">
      <div className="release-board__ships">
        <p className="release-board__label">{notes.title}</p>
        {notes.items.length > 0 ? (
          <ul className="release-board__list">
            {notes.items.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="release-board__muted">Nothing is waiting.</p>
        )}
      </div>
      <p className="release-board__muted">{notes.coverage}</p>
    </div>
  );
}

/**
 * What has not shipped, at the top of the board: the stages the collector
 * marked warn or bad, the pins that are not level, and merged or stranded
 * work. Yellow unless something is bad. Absent when everything ships.
 */
export function UnshippedBanner({ board }: { board: ReleaseBoard }): JSX.Element | null {
  const found = unshipped(board);
  if (!found) return null;
  return (
    <div
      className={`release-board__unshipped release-board__unshipped--${found.state}`}
      role="status"
      data-testid="release-board-unshipped"
    >
      <p className="release-board__label">{unshippedHeadline(found)}</p>
      <ul className="release-board__list">
        {found.stages.map((stage) => (
          <li key={`${stage.laneId}-${stage.stage}`}>
            <a href={`#${laneAnchorId(stage.laneId)}`}>
              <strong>{stage.lane}</strong> · {stage.stage}
            </a>
            : {stage.status}
          </li>
        ))}
        {found.pins.length > 0 ? (
          <li>
            <strong>{found.pinLabel}</strong> (see Pinned vs released):{' '}
            {unshippedPinsText(found.pins)}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Sources the collector could not read on this run, compactly. */
export function ProblemList({ problems }: { problems: BoardProblem[] }): JSX.Element | null {
  if (problems.length === 0) return null;
  return (
    <div className="release-board__problems" role="alert" data-testid="release-board-problems">
      <p className="release-board__label">
        The collector could not read {problems.length} source{problems.length === 1 ? '' : 's'}{' '}
        on this run; their stages may be out of date.
      </p>
      <ul className="release-board__list">
        {problems.map((problem, index) => (
          <li key={`${index}-${problem.source}`}>
            <strong>{problem.source}</strong>: {problem.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
