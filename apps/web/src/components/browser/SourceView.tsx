// SourceView.tsx — a plain, read-only view of a text file.
//
// Line numbers in a gutter, selectable text, and `#L<n>` anchors that scroll to
// and mark one line. No editor, no worker, no network: it renders the moment
// the blob arrives and cannot be blocked by a Content-Security-Policy.

import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import {
  hashForLine,
  lineElementId,
  lineFromHash,
  splitSourceLines,
} from './sourceViewModel';

export interface SourceViewProps {
  text: string;
  /** Monospace size in px, from the reader's preferences. */
  fontSize: number;
  /** Label for assistive tech, usually the file path. */
  label: string;
}

export function SourceView({ text, fontSize, label }: SourceViewProps): JSX.Element {
  const source = useMemo(() => splitSourceLines(text), [text]);
  const { hash } = useLocation();
  const marked = lineFromHash(hash);

  useEffect(() => {
    if (marked === null) return;
    document.getElementById(lineElementId(marked))?.scrollIntoView({ block: 'center' });
  }, [marked, source]);

  if (source.total === 0) {
    return <p className="source-view__empty">This file is empty.</p>;
  }

  return (
    <div className="source-view table-scroll" style={{ fontSize: `${fontSize}px` }}>
      <table className="source-view__table" aria-label={`Source of ${label}`}>
        <tbody>
          {source.lines.map((line, index) => {
            const number = index + 1;
            return (
              <tr
                key={number}
                id={lineElementId(number)}
                className={number === marked ? 'source-view__line is-marked' : 'source-view__line'}
              >
                <td className="source-view__number">
                  <a href={hashForLine(number)} aria-label={`Line ${number}`}>
                    {number}
                  </a>
                </td>
                <td className="source-view__code">{line === '' ? '\n' : line}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {source.truncated ? (
        <p className="source-view__note">
          Showing the first {source.lines.length.toLocaleString()} of{' '}
          {source.total.toLocaleString()} lines. Use Raw for the whole file.
        </p>
      ) : null}
    </div>
  );
}
