// ReviewFindingsTable.tsx — a review's findings table, laid out for reading.
//
// Review bots write their findings as a Markdown table with a severity column,
// a long Finding column and a Where column (`path:line`). Rendered plainly the
// Finding text runs for a screen per row while severity and Where are squeezed
// into slivers. A table whose header names both Finding and Where is laid out
// again: Where moves to the top of its finding, severity keeps its width on one
// line, and each finding shows three lines with a "more" button at its bottom
// right that opens the rest. A Where naming one file of the pull request links
// to that file on the Files tab. Any other table renders unchanged.

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Link } from 'react-router-dom';

import { findingLocation, findingsLayout, type FindingLocation } from './reviewFindingsModel';

/** Where a finding's file is read; without one, Where stays plain text. */
export const FindingHrefContext = createContext<((location: FindingLocation) => string) | null>(null);

type TableProps = ComponentPropsWithoutRef<'table'> & { node?: unknown };

interface ElementProps {
  children?: ReactNode;
}

function elementsOf(children: ReactNode, tag: string): ReactElement<ElementProps>[] {
  return Children.toArray(children).filter(
    (child): child is ReactElement<ElementProps> => isValidElement<ElementProps>(child) && child.type === tag
  );
}

function rowsOf(children: ReactNode, section: string, cell: string): ReactNode[][] {
  return elementsOf(children, section).flatMap((part) =>
    elementsOf(part.props.children, 'tr').map((row) =>
      elementsOf(row.props.children, cell).map((entry) => entry.props.children)
    )
  );
}

/** The plain text of rendered Markdown, for reading a header cell. */
export function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<ElementProps>(node)) return textOf(node.props.children);
  return '';
}

function FindingWhere({ children }: { children: ReactNode }): JSX.Element {
  const hrefOf = useContext(FindingHrefContext);
  const location = hrefOf ? findingLocation(textOf(children)) : null;
  return (
    <div className="review-findings__where">
      {hrefOf && location ? (
        <Link to={hrefOf(location)} className="review-findings__where-link">
          {children}
        </Link>
      ) : (
        children
      )}
    </div>
  );
}

function ClampedFinding({ children }: { children: ReactNode }): JSX.Element {
  const textRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return undefined;
    const measure = (): void => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <>
      <div
        ref={textRef}
        className={`review-findings__text${expanded ? '' : ' review-findings__text--clamped'}`}
        data-testid="review-finding-text"
      >
        {children}
      </div>
      {overflowing || expanded ? (
        <button
          type="button"
          className="review-findings__more"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'less' : 'more'}
        </button>
      ) : null}
    </>
  );
}

export function ReviewFindingsTable({ node: _node, children, ...rest }: TableProps): JSX.Element {
  const header = rowsOf(children, 'thead', 'th')[0] ?? [];
  const layout = findingsLayout(header.map(textOf));
  if (!layout) return <table {...rest}>{children}</table>;

  const { finding, where, columns } = layout;
  const rows = rowsOf(children, 'tbody', 'td');
  return (
    <table {...rest} className="review-findings">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} className={column === finding ? undefined : 'review-findings__aside'}>
              {header[column]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) =>
              column === finding ? (
                <td key={column} className="review-findings__finding">
                  {row[where] ? <FindingWhere>{row[where]}</FindingWhere> : null}
                  <ClampedFinding>{row[column]}</ClampedFinding>
                </td>
              ) : (
                <td key={column} className="review-findings__aside">
                  {row[column]}
                </td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
