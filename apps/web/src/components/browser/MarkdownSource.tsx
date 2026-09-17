// MarkdownSource.tsx — renders Markdown source in the browser.
//
// The server's rendered README HTML splits every source line into its own
// paragraph, so tables, headings after text, and badges arrive as literal
// text. When the raw Markdown is available we render it here instead with
// GitHub-flavoured Markdown, sanitized by rehype-sanitize, into the same
// `.markdown-body` container the global stylesheet already styles.

import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

import './browser.css';

export interface MarkdownSourceProps {
  markdown: string;
  /**
   * SPA path that relative links resolve against, ending in `/`
   * (e.g. `/repos/jeryu/root/bullet-kernel/blob/main/`).
   */
  linkBase?: string;
  className?: string;
}

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/** Resolve a relative Markdown link against `linkBase`; leave others alone. */
export function resolveMarkdownHref(href: string, linkBase?: string): string {
  if (!linkBase || href === '' || href.startsWith('#') || href.startsWith('/') || EXTERNAL.test(href)) {
    return href;
  }
  const url = new URL(href, `https://spa.invalid${linkBase}`);
  return `${url.pathname}${url.search}${url.hash}`;
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function MarkdownSource({ markdown, linkBase, className }: MarkdownSourceProps): JSX.Element {
  const navigate = useNavigate();

  function Anchor({ href = '', children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>): JSX.Element {
    const target = resolveMarkdownHref(href, linkBase);
    if (/^https?:\/\//i.test(target)) {
      return (
        <a {...rest} href={target} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    return (
      <a
        {...rest}
        href={target}
        onClick={(event) => {
          if (!target.startsWith('/') || !isPlainLeftClick(event)) return;
          event.preventDefault();
          navigate(target);
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <div className={`markdown-body ${className ?? ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeSanitize]}
        urlTransform={defaultUrlTransform}
        components={{ a: Anchor }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
