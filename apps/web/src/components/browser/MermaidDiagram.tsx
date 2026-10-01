// MermaidDiagram.tsx — a ```mermaid fenced block, drawn as an SVG.
//
// Mermaid is a large library, so it is imported dynamically the first time a
// diagram scrolls into view: it lives in its own chunk and a README without
// diagrams never pays for it. The library runs with `securityLevel: 'strict'`
// and `htmlLabels: false`, and the SVG it produces is still sanitized with
// DOMPurify's `svg` + `svgFilters` profiles before it reaches the document.
//
// Insertion never goes through `.innerHTML`: the sanitized markup is parsed
// with `DOMParser` into an SVG document and its root node is imported into a
// ref'd container. Anything that fails — an oversize source, a parse error, a
// render that runs too long — falls back to the original code block plus a
// short note, never to blank space.

import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';
import { useEffect, useRef, useState } from 'react';

import './browser.css';

export interface MermaidDiagramProps {
  /** The fenced block's contents, verbatim. */
  source: string;
  /** Extra classes appended to the figure element. */
  className?: string;
}

/** Sources past this size are shown as code: drawing them is not worth it. */
export const MERMAID_MAX_SOURCE_BYTES = 50_000;

/** A render that takes longer than this gives up and shows the source. */
export const MERMAID_RENDER_TIMEOUT_MS = 8_000;

type DiagramState =
  | { kind: 'pending' }
  | { kind: 'drawn'; svg: SVGElement }
  | { kind: 'unavailable'; reason: string };

/** DOMPurify profiles for a rendered diagram: shapes and filters, nothing else. */
const SVG_PURIFY_CONFIG: DOMPurifyConfig = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // `securityLevel: 'strict'` already refuses these; refuse them again here so
  // a library change cannot widen what we accept.
  FORBID_TAGS: ['foreignObject', 'script', 'style', 'a', 'use'],
  FORBID_ATTR: ['xlink:href', 'href'],
  ALLOW_DATA_ATTR: false,
};

/** The label a screen reader hears: a `title:` directive, else the first line. */
export function mermaidLabel(source: string): string {
  const lines = source.split('\n').map((line) => line.trim());
  for (const line of lines) {
    const title = /^title\s*:?\s+(.+)$/i.exec(line);
    if (title) return `diagram: ${title[1]}`;
  }
  const first = lines.find((line) => line !== '' && !line.startsWith('%%'));
  return first ? `diagram: ${first}` : 'diagram';
}

/** The first line of a failure, which is the part worth showing. */
export function firstErrorLine(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown error');
  const first = message.split('\n').find((line) => line.trim() !== '');
  return (first ?? 'unknown error').trim();
}

/**
 * Sanitize a rendered diagram and hand back its root node.
 *
 * Throws with the reason it could not, so the note the reader sees names what
 * went wrong instead of collapsing three failures into one.
 */
export function parseDiagramSvg(svg: string): SVGElement {
  const clean: unknown = DOMPurify.sanitize(svg, SVG_PURIFY_CONFIG);
  if (typeof clean !== 'string' || clean.trim() === '') {
    throw new Error('sanitizing the rendered diagram left nothing to draw');
  }
  const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new Error('the sanitized diagram is not well-formed SVG');
  }
  const root = parsed.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error(
      `the rendered diagram's root element is <${root ? root.nodeName.toLowerCase() : 'nothing'}>, not <svg>`
    );
  }
  return root as unknown as SVGElement;
}

/** Light or dark, as the shell resolved it onto `<html>`. */
function resolvedTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  const attribute = document.documentElement.getAttribute('data-theme');
  if (attribute === 'light') return 'light';
  if (attribute) return 'dark';
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === false
    ? 'light'
    : 'dark';
}

/** Mermaid's `base` theme variables, the only theme Mermaid lets us recolour. */
export interface MermaidThemeVariables {
  darkMode: boolean;
  background: string;
  fontFamily: string;
  primaryColor: string;
  primaryTextColor: string;
  primaryBorderColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  mainBkg: string;
  nodeBorder: string;
  lineColor: string;
  textColor: string;
  titleColor: string;
  clusterBkg: string;
  clusterBorder: string;
  edgeLabelBackground: string;
  noteBkgColor: string;
  noteTextColor: string;
  noteBorderColor: string;
}

// Used when a token cannot be read (tests, or a page without the stylesheet).
// The values mirror styles/tokens.css.
const FALLBACK_TOKENS: Record<'light' | 'dark', Record<string, string>> = {
  dark: {
    'bg-0': '#05070a',
    'bg-1': '#0a0e14',
    'bg-2': '#10151d',
    'bg-3': '#04060a',
    'fg-primary': '#e8f0f7',
    'fg-secondary': '#9fb0c3',
    'border-subtle': '#17202b',
    'border-strong': '#2b3a4b',
    'accent-primary': '#22d3ee',
  },
  light: {
    'bg-0': '#f6f8fa',
    'bg-1': '#ffffff',
    'bg-2': '#eef1f5',
    'bg-3': '#e4e9ef',
    'fg-primary': '#0b1220',
    'fg-secondary': '#3f4a5c',
    'border-subtle': '#d3d9e0',
    'border-strong': '#aab3bf',
    'accent-primary': '#0a7ea4',
  },
};

/**
 * The page's own colour tokens as Mermaid theme variables, so a diagram is drawn
 * in the forge's palette, light, dark or high contrast, rather than in Mermaid's
 * stock themes, which ignore it. Each token is read from `<html>` as the
 * stylesheet resolved it; anything unreadable falls back to the same palette.
 */
export function mermaidThemeVariables(theme: 'light' | 'dark'): MermaidThemeVariables {
  const style =
    typeof document !== 'undefined' && typeof getComputedStyle === 'function'
      ? getComputedStyle(document.documentElement)
      : null;
  const token = (name: string): string => {
    const value = style?.getPropertyValue(`--color-${name}`).trim() ?? '';
    // Mermaid derives shades from these, so only plain colours are taken;
    // a translucent or var() value falls back.
    return /^#[0-9a-f]{3,8}$/i.test(value) || /^rgb\(/i.test(value)
      ? value
      : FALLBACK_TOKENS[theme][name];
  };
  const font = style?.getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif';
  return {
    darkMode: theme === 'dark',
    background: token('bg-1'),
    fontFamily: font,
    primaryColor: token('bg-2'),
    primaryTextColor: token('fg-primary'),
    primaryBorderColor: token('accent-primary'),
    secondaryColor: token('bg-3'),
    tertiaryColor: token('bg-0'),
    mainBkg: token('bg-2'),
    nodeBorder: token('accent-primary'),
    lineColor: token('fg-secondary'),
    textColor: token('fg-primary'),
    titleColor: token('fg-primary'),
    clusterBkg: token('bg-0'),
    clusterBorder: token('border-strong'),
    edgeLabelBackground: token('bg-1'),
    noteBkgColor: token('bg-3'),
    noteTextColor: token('fg-primary'),
    noteBorderColor: token('border-strong'),
  };
}

let idCounter = 0;

export function MermaidDiagram({
  source,
  className,
}: MermaidDiagramProps): JSX.Element {
  const oversize = new TextEncoder().encode(source).length > MERMAID_MAX_SOURCE_BYTES;
  const [state, setState] = useState<DiagramState>(() =>
    oversize
      ? {
          kind: 'unavailable',
          reason: `the source is larger than ${Math.round(MERMAID_MAX_SOURCE_BYTES / 1024)} KB`,
        }
      : { kind: 'pending' }
  );
  const [visible, setVisible] = useState(oversize ? false : !supportsObserver());
  const [theme, setTheme] = useState(resolvedTheme);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const figureRef = useRef<HTMLElement | null>(null);

  // Draw only what the reader can see: a README with many diagrams stays fast.
  useEffect(() => {
    const target = figureRef.current;
    if (oversize || visible || !target || !supportsObserver()) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [oversize, visible]);

  // Follow the shell's light/dark choice, which lands as `<html data-theme>`,
  // and the operating system's when the shell defers to it.
  useEffect(() => {
    const update = () => setTheme(resolvedTheme());
    const observer =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    media?.addEventListener?.('change', update);
    return () => {
      observer?.disconnect();
      media?.removeEventListener?.('change', update);
    };
  }, []);

  useEffect(() => {
    if (!visible || oversize) return;
    let cancelled = false;
    const id = `mermaid-diagram-${(idCounter += 1)}`;

    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          theme: 'base',
          themeVariables: mermaidThemeVariables(theme),
        });
        await mermaid.parse(source);
        if (cancelled) return;
        const rendered = await withTimeout(
          mermaid.render(id, source),
          MERMAID_RENDER_TIMEOUT_MS
        );
        if (cancelled) return;
        setState({ kind: 'drawn', svg: parseDiagramSvg(rendered.svg) });
      } catch (error) {
        if (!cancelled) {
          setState({ kind: 'unavailable', reason: firstErrorLine(error) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, oversize, source, theme]);

  // Insert the sanitized SVG as nodes, never as markup.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    if (state.kind !== 'drawn') return;
    const node = document.importNode(state.svg, true);
    // The container is the accessible image; the SVG inside it would otherwise
    // announce itself a second time through its own implicit role.
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    host.appendChild(node);
  }, [state]);

  const label = mermaidLabel(source);
  const sourceBlock = (
    <pre className="mermaid-diagram__source">
      <code className="language-mermaid">{source}</code>
    </pre>
  );

  return (
    <figure
      className={`mermaid-diagram ${className ?? ''}`.trim()}
      ref={figureRef}
      data-state={state.kind}
    >
      {state.kind === 'drawn' ? (
        <>
          <div
            className="mermaid-diagram__svg"
            ref={hostRef}
            role="img"
            aria-label={label}
          />
          <details className="mermaid-diagram__details">
            <summary>Source</summary>
            {sourceBlock}
          </details>
        </>
      ) : (
        <>
          <div ref={hostRef} hidden />
          {sourceBlock}
          {state.kind === 'unavailable' ? (
            <figcaption className="mermaid-diagram__note">
              diagram could not be rendered: {state.reason}
            </figcaption>
          ) : null}
        </>
      )}
    </figure>
  );
}

function supportsObserver(): boolean {
  return typeof IntersectionObserver !== 'undefined';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`rendering took longer than ${ms} ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
