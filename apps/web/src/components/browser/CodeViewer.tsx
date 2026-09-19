// CodeViewer.tsx — read-only file view with a markdown rendering toggle
// (W-FE-10).
//
// Source renders through SourceView: plain lines with a number gutter and
// `#L<n>` anchors, nothing fetched from anywhere. For .md files a second tab
// renders the markdown; "Rendered" is the default so a README reads like one.

import { useState } from 'react';

import { usePreferencesStore } from '../../stores/preferencesStore';

import { MarkdownRenderer } from './MarkdownRenderer';
import { MarkdownSource } from './MarkdownSource';
import { dirOf } from './markdownImages';
import { SourceView } from './SourceView';
import { isMarkdownPath } from '../../hooks/useBlob';

import './browser.css';

export interface CodeViewerProps {
  /** File path (used to detect language + markdown handling). */
  path: string;
  /** UTF-8 file content. May be `null` if the blob is binary. */
  text: string | null;
  /** Server-rendered sanitized markdown HTML; `null` if not markdown. */
  renderedHtml?: string | null;
  /** SPA path relative Markdown links resolve against, ending in `/`. */
  linkBase?: string;
  /** Maps a repository path to a loadable URL, for relative Markdown images. */
  imageSrc?: (repoPath: string) => string;
  /** Best-effort MIME type from the blob response. */
  mime?: string;
  /** When true, the viewer renders a "Binary file" notice instead. */
  isBinary?: boolean;
}

export function CodeViewer({
  path,
  text,
  renderedHtml,
  mime,
  isBinary,
  linkBase,
  imageSrc,
}: CodeViewerProps): JSX.Element {
  const isMd = isMarkdownPath(path);
  const hasRenderedHtml = isMd && (typeof text === 'string' || typeof renderedHtml === 'string');
  const codeFontSize = usePreferencesStore((s) => s.codeFontSize);
  const [tab, setTab] = useState<'rendered' | 'raw'>(
    hasRenderedHtml ? 'rendered' : 'raw'
  );
  if (isBinary) {
    return (
      <div className="code-viewer">
        <p>Binary file ({mime ?? 'application/octet-stream'}).</p>
      </div>
    );
  }

  return (
    <div className="code-viewer">
      {hasRenderedHtml ? (
        <div className="code-viewer__toolbar">
          <div
            className="code-viewer__tabs"
            role="tablist"
            aria-label="View"
          >
            <button
              type="button"
              role="tab"
              className="code-viewer__tab"
              aria-selected={tab === 'rendered'}
              onClick={() => setTab('rendered')}
            >
              Rendered
            </button>
            <button
              type="button"
              role="tab"
              className="code-viewer__tab"
              aria-selected={tab === 'raw'}
              onClick={() => setTab('raw')}
            >
              Raw
            </button>
          </div>
        </div>
      ) : null}
      {tab === 'rendered' && hasRenderedHtml ? (
        <div className="code-viewer__rendered">
          {typeof text === 'string' ? (
            <MarkdownSource
              markdown={text}
              linkBase={linkBase}
              docDir={dirOf(path)}
              imageSrc={imageSrc}
            />
          ) : (
            <MarkdownRenderer html={renderedHtml ?? ''} />
          )}
        </div>
      ) : text !== null ? (
        <SourceView text={text} fontSize={codeFontSize} label={path} />
      ) : (
        <p className="source-view__empty">This file has no text to show.</p>
      )}
    </div>
  );
}
