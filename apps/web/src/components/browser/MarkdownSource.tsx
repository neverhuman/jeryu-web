// MarkdownSource.tsx — renders Markdown source in the browser.
//
// The server's rendered README HTML splits every source line into its own
// paragraph, so tables, headings after text, and badges arrive as literal
// text. When the raw Markdown is available we render it here instead with
// GitHub-flavoured Markdown, sanitized by rehype-sanitize, into the same
// `.markdown-body` container the global stylesheet already styles.

import { isValidElement, useMemo, useRef, type AnchorHTMLAttributes, type HTMLAttributes, type ImgHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import { MarkdownImage } from './MarkdownImage';
import { MermaidDiagram } from './MermaidDiagram';
import { remarkGfmRead } from './remarkGfmRead';

import './browser.css';

export interface MarkdownSourceProps {
  markdown: string;
  /**
   * SPA path that relative links resolve against, ending in `/`
   * (e.g. `/repos/jeryu/root/bullet-kernel/blob/main/`).
   */
  linkBase?: string;
  /** Directory of this Markdown file inside the repository, ending in `/`. */
  docDir?: string;
  /** Maps a repository path to a loadable URL, for relative images. */
  imageSrc?: (repoPath: string) => string;
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

/** The source of a ```mermaid fence, given the `<pre>`'s children. */
export function mermaidSourceOfChildren(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) return null;
  const { className, children: text } = children.props;
  if (!className?.split(/\s+/).includes('language-mermaid')) return null;
  return typeof text === 'string' ? text : null;
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function MarkdownSource({
  markdown,
  linkBase,
  docDir,
  imageSrc,
  className,
}: MarkdownSourceProps): JSX.Element {
  const navigate = useNavigate();
  // Callers pass `imageSrc` inline; keep the latest without changing the
  // component identities below, or every parent render would remount each
  // image and load it again.
  const imageSrcRef = useRef(imageSrc);
  imageSrcRef.current = imageSrc;

  const components = useMemo(() => {
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
    function Image(props: ImgHTMLAttributes<HTMLImageElement>): JSX.Element {
      return (
        <MarkdownImage
          {...props}
          docDir={docDir}
          imageSrc={(repoPath) => imageSrcRef.current?.(repoPath) ?? repoPath}
        />
      );
    }
    function Pre({ children, ...rest }: HTMLAttributes<HTMLPreElement>): JSX.Element {
      const mermaid = mermaidSourceOfChildren(children);
      if (mermaid !== null) {
        return <MermaidDiagram source={mermaid} />;
      }
      return <pre {...rest}>{children}</pre>;
    }
    return { a: Anchor, img: Image, pre: Pre };
  }, [linkBase, docDir, navigate]);

  // HTML written in the Markdown (an <img>, a comment) is parsed and then
  // sanitized like everything else; without the parse it showed as literal text.
  return (
    <div className={`markdown-body ${className ?? ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfmRead]}
        rehypePlugins={[rehypeRaw, rehypeSlug, rehypeSanitize]}
        urlTransform={defaultUrlTransform}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
