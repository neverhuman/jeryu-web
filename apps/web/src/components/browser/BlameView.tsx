// BlameView.tsx — a file's lines with an author gutter.
//
// The same plain table the source view renders, with one column more: who
// last changed each run of lines, when, and a link to that commit. Nothing is
// fetched here; the page passes the blob text and the blame it already read.

import { Link } from 'react-router-dom';

import { When } from '../../format/When';
import type { BlameResponse } from '../../api/types/wiki';

import { blameRows } from './blameViewModel';
import { hashForLine, lineElementId } from './sourceViewModel';
import { formatCount } from '../../format/number';

export interface BlameViewProps {
  text: string;
  blame: BlameResponse | undefined;
  /** Monospace size in px, from the reader's preferences. */
  fontSize: number;
  /** Label for assistive tech, usually the file path. */
  label: string;
  /** Where one commit of the gutter is read. */
  commitHref: (sha: string) => string;
}

export function BlameView({
  text,
  blame,
  fontSize,
  label,
  commitHref,
}: BlameViewProps): JSX.Element {
  const lines = blameRows(text, blame);
  if (lines.total === 0) {
    return <p className="source-view__empty">This file is empty.</p>;
  }

  return (
    <div
      className="source-view blame-view table-scroll"
      style={{ fontSize: `${fontSize}px` }}
      data-testid="blame-view"
    >
      <table className="source-view__table" aria-label={`Blame of ${label}`}>
        <tbody>
          {lines.rows.map((row) => (
            <tr key={row.line} id={lineElementId(row.line)} className="source-view__line">
              {row.gutter ? (
                <td className="blame-view__who" rowSpan={row.gutter.lines}>
                  <Link
                    to={commitHref(row.gutter.commit.sha)}
                    className="blame-view__commit"
                    title={row.gutter.commit.summary}
                  >
                    {row.gutter.commit.summary || row.gutter.commit.sha.slice(0, 7)}
                  </Link>
                  <span className="blame-view__author">
                    {row.gutter.commit.author}
                    <span aria-hidden="true"> · </span>
                    <time
                      dateTime={row.gutter.commit.authored_at}
                      title={row.gutter.commit.authored_at}
                    >
                      <When at={row.gutter.commit.authored_at} />
                    </time>
                  </span>
                </td>
              ) : null}
              <td className="source-view__number">
                <a href={hashForLine(row.line)} aria-label={`Line ${row.line}`}>
                  {row.line}
                </a>
              </td>
              <td className="source-view__code">{row.text === '' ? '\n' : row.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {lines.truncated ? (
        <p className="source-view__note">
          Showing the first {formatCount(lines.rows.length)} of{' '}
          {formatCount(lines.total)} lines. Use Raw for the whole file.
        </p>
      ) : null}
    </div>
  );
}
