// DiffViewer.tsx — virtualized unified-diff renderer (W-FE-11).
//
// Renders the active file's hunks one row per line via
// `@tanstack/react-virtual` so a 5 000-line diff stays interactive. Each row
// carries its line type (`+` / `-` / context / hunk-header) so CSS can
// colour it; clicking the line number opens an inline-comment composer
// anchored to that line.
//
// `mode` is a viewer preference kept in the preferences store. Unified is
// one row per line at a fixed height; split puts base and head side by side
// (see `diffRowsModel.ts`) and wraps long lines, so its rows are measured.

import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { MessageSquarePlus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import type { PullRequestDiffFile } from '../../api/types';
import { ActionButton } from '../action/ActionButton';

import {
  flattenHunks,
  splitRows,
  type SplitRow,
  type SplitSide,
} from './diffRowsModel';
import { InlineComment } from './InlineComment';
import './merge.css';

export type DiffViewerMode = 'unified' | 'split';

const ROW_HEIGHT_PX = 20;

export interface DiffViewerProps {
  file: PullRequestDiffFile;
  mode: DiffViewerMode;
  onModeChange: (mode: DiffViewerMode) => void;
  /** Submit a new inline comment at `path:line`. */
  onAddComment?: (path: string, line: number, body: string) => Promise<void> | void;
  className?: string;
}

export function DiffViewer({
  file,
  mode,
  onModeChange,
  onAddComment,
  className,
}: DiffViewerProps): JSX.Element {
  const rows = useMemo(() => flattenHunks(file.hunks), [file.hunks]);
  const split = mode === 'split';
  const pairs = useMemo(() => (split ? splitRows(rows) : []), [split, rows]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [composerLine, setComposerLine] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const virtualizer = useVirtualizer({
    count: split ? pairs.length : rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12,
  });

  const handleSubmitComment = async (line: number, body: string): Promise<void> => {
    if (!onAddComment) return;
    try {
      setSubmitting(true);
      await onAddComment(file.path, line, body);
      setComposerLine(null);
    } finally {
      setSubmitting(false);
    }
  };

  const renderSide = (
    side: SplitSide | null,
    which: 'left' | 'right',
  ): JSX.Element => {
    // A deletion is commented on by its base line and everything on the right
    // by its head line: the anchors the unified view uses.
    const commentable =
      onAddComment && side && (which === 'right' || side.kind === 'del');
    return (
      <div
        className={`diff-viewer__side diff-viewer__side--${side?.kind ?? 'empty'}`}
      >
        <span className="diff-viewer__gutter">{side?.line ?? ''}</span>
        <span className="diff-viewer__prefix">
          {side?.kind === 'add' ? '+' : side?.kind === 'del' ? '−' : ' '}
        </span>
        <span className="diff-viewer__text">{side?.text ?? ''}</span>
        {commentable ? (
          <button
            type="button"
            className="diff-viewer__add-comment"
            aria-label={`Comment on line ${side.line}`}
            onClick={() => setComposerLine(side.line)}
          >
            <MessageSquarePlus aria-hidden="true" size={10} />
          </button>
        ) : null}
      </div>
    );
  };

  // Split rows wrap long lines, so each is measured rather than fixed.
  const renderPair = (
    pair: SplitRow | undefined,
    virtualRow: VirtualItem,
  ): JSX.Element | undefined => {
    if (!pair) return;
    return (
      <div
        key={pair.key}
        ref={virtualizer.measureElement}
        data-index={virtualRow.index}
        className={`diff-viewer__row diff-viewer__row--split ${pair.kind === 'hunk' ? 'diff-viewer__row--hunk' : ''}`.trim()}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translateY(${virtualRow.start}px)`,
        }}
      >
        {pair.kind === 'hunk' ? (
          <span className="diff-viewer__hunk-header">{pair.text}</span>
        ) : (
          <>
            {renderSide(pair.left, 'left')}
            {renderSide(pair.right, 'right')}
          </>
        )}
      </div>
    );
  };

  if (file.is_binary) {
    return (
      <div
        className={`diff-viewer diff-viewer--binary ${className ?? ''}`.trim()}
        role="region"
        aria-label={`Diff for ${file.path}`}
      >
        <header className="diff-viewer__toolbar">
          <h4 className="diff-viewer__title">{file.path}</h4>
        </header>
        <p className="diff-viewer__binary">Binary file — diff suppressed.</p>
      </div>
    );
  }

  return (
    <div
      className={`diff-viewer diff-viewer--${mode} ${className ?? ''}`.trim()}
      role="region"
      aria-label={`Diff for ${file.path}`}
    >
      <header className="diff-viewer__toolbar">
        <h4 className="diff-viewer__title">{file.path}</h4>
        <div
          className="diff-viewer__mode-toggle"
          role="group"
          aria-label="Diff view"
        >
          <button
            type="button"
            className={`diff-viewer__mode-button ${mode === 'unified' ? 'diff-viewer__mode-button--active' : ''}`.trim()}
            aria-pressed={mode === 'unified'}
            onClick={() => onModeChange('unified')}
          >
            Unified
          </button>
          <button
            type="button"
            className={`diff-viewer__mode-button ${mode === 'split' ? 'diff-viewer__mode-button--active' : ''}`.trim()}
            aria-pressed={mode === 'split'}
            onClick={() => onModeChange('split')}
          >
            Split
          </button>
        </div>
      </header>
      <div
        ref={containerRef}
        className="diff-viewer__scroll"
        // Bounded height so the virtualizer has a scrolling parent.
        style={{ maxHeight: '70vh', overflow: 'auto' }}
        tabIndex={0}
        data-testid="diff-viewer-scroll"
      >
        <div
          className="diff-viewer__inner"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            if (split) return renderPair(pairs[virtualRow.index], virtualRow);
            const row = rows[virtualRow.index];
            if (!row) return;
            const line = row.headLine ?? row.baseLine;
            return (
              <div
                key={row.key}
                className={`diff-viewer__row diff-viewer__row--${row.kind}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.kind === 'hunk' ? (
                  <span className="diff-viewer__hunk-header">{row.text}</span>
                ) : (
                  <>
                    <span className="diff-viewer__gutter diff-viewer__gutter--base">
                      {row.baseLine ?? ''}
                    </span>
                    <span className="diff-viewer__gutter diff-viewer__gutter--head">
                      {row.headLine ?? ''}
                    </span>
                    <span className="diff-viewer__prefix">
                      {row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}
                    </span>
                    <span className="diff-viewer__text">{row.text}</span>
                    {onAddComment && line !== null ? (
                      <button
                        type="button"
                        className="diff-viewer__add-comment"
                        aria-label={`Comment on line ${line}`}
                        onClick={() => setComposerLine(line)}
                      >
                        <MessageSquarePlus aria-hidden="true" size={10} />
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {composerLine !== null ? (
        <div className="diff-viewer__composer" data-line={composerLine}>
          <p className="diff-viewer__composer-anchor">
            Commenting on line {composerLine}
          </p>
          <InlineComment
            mode="compose"
            hintText="Leave an inline comment…"
            isSubmitting={submitting}
            onSubmit={(body) => handleSubmitComment(composerLine, body)}
            onCancel={() => setComposerLine(null)}
          />
        </div>
      ) : null}
      {!composerLine && onAddComment ? (
        <ActionButton
          variant="ghost"
          icon={<MessageSquarePlus aria-hidden="true" size={12} />}
          onClick={() => setComposerLine(rows.find((r) => r.headLine)?.headLine ?? 1)}
          className="diff-viewer__add-button"
        >
          Add comment
        </ActionButton>
      ) : null}
    </div>
  );
}
