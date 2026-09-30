// MermaidDiagram.test.tsx — diagram rendering, its fallback, and its limits.
//
// Mermaid itself is mocked at the module boundary: jsdom cannot measure text,
// so the real library's layout is not what these tests are about. What they
// pin is our side of the contract — the sanitized SVG that reaches the DOM,
// the code-block fallback with its note, and the source-size cap.

import { render, screen, waitFor } from '@testing-library/react';
import DOMPurify from 'dompurify';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownRenderer } from '../MarkdownRenderer';
import { MarkdownSource } from '../MarkdownSource';
import {
  MERMAID_MAX_SOURCE_BYTES,
  MermaidDiagram,
  mermaidLabel,
  parseDiagramSvg,
} from '../MermaidDiagram';

const initialize = vi.fn();
const parse = vi.fn<(source: string) => Promise<boolean>>();
const renderDiagram = vi.fn<(id: string, source: string) => Promise<{ svg: string }>>();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initialize(...args),
    parse: (source: string) => parse(source),
    render: (id: string, source: string) => renderDiagram(id, source),
  },
}));

const FLOWCHART = 'flowchart TD\n  A[Ingest] --> B[Fan out]\n  B --> C[Report]';

describe('MermaidDiagram', () => {
  beforeEach(() => {
    initialize.mockClear();
    parse.mockReset().mockResolvedValue(true);
    renderDiagram
      .mockReset()
      .mockResolvedValue({
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="node"><rect width="4" height="2"/></g></svg>',
      });
  });

  it('draws a flowchart as an inline svg with an accessible label', async () => {
    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });
    const image = screen.getByRole('img');
    expect(image.getAttribute('aria-label')).toBe('diagram: flowchart TD');
    expect(container.querySelector('svg rect')).not.toBeNull();
    // The source stays reachable behind the toggle.
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(container.querySelector('code.language-mermaid')?.textContent).toBe(
      FLOWCHART
    );
  });

  it('follows the shell theme when choosing mermaid options', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<MermaidDiagram source={FLOWCHART} />);
    await waitFor(() => expect(initialize).toHaveBeenCalled());
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        theme: 'default',
      })
    );
    document.documentElement.removeAttribute('data-theme');
  });

  it('shows the source and a note when the diagram does not parse', async () => {
    parse.mockRejectedValue(
      new Error('Parse error on line 2:\n  expecting a node id')
    );

    const { container } = render(<MermaidDiagram source={'flowchart TD\n  ???'} />);

    await waitFor(() => {
      expect(
        screen.getByText(/diagram could not be rendered: Parse error on line 2:/)
      ).toBeInTheDocument();
    });
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('code.language-mermaid')?.textContent).toContain(
      '???'
    );
    expect(renderDiagram).not.toHaveBeenCalled();
  });

  it('keeps a script, a foreignObject and a click handler out of the DOM', async () => {
    renderDiagram.mockResolvedValue({
      svg: [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
        '<script>window.__mermaidXss = true;</script>',
        '<foreignObject><div onclick="window.__mermaidXss = true">label</div></foreignObject>',
        '<g class="node clickable" onclick="window.__mermaidXss = true">',
        '<rect width="4" height="2" onmouseover="window.__mermaidXss = true"/>',
        '</g>',
        '</svg>',
      ].join(''),
    });

    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('foreignObject')).toBeNull();
    const withHandler = Array.from(container.querySelectorAll('*')).filter((node) =>
      node.getAttributeNames().some((name) => name.startsWith('on'))
    );
    expect(withHandler).toEqual([]);
    expect(
      (window as unknown as { __mermaidXss?: boolean }).__mermaidXss
    ).toBeUndefined();
  });

  it('shows the code block for a source past the size cap', async () => {
    const huge = `flowchart TD\n${'  A --> B\n'.repeat(
      Math.ceil(MERMAID_MAX_SOURCE_BYTES / 10) + 1
    )}`;

    const { container } = render(<MermaidDiagram source={huge} />);

    expect(
      screen.getByText(/diagram could not be rendered: the source is larger than 49 KB/)
    ).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    await waitFor(() => expect(renderDiagram).not.toHaveBeenCalled());
  });

  it('names the sanitized diagram it could not draw in the note', async () => {
    renderDiagram.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg">&nbsp;</svg>',
    });

    const { container } = render(<MermaidDiagram source={FLOWCHART} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /diagram could not be rendered: the sanitized diagram is not well-formed SVG/
        )
      ).toBeInTheDocument();
    });
    expect(container.querySelector('svg')).toBeNull();
  });

  it('labels a diagram from a title directive when it has one', () => {
    expect(mermaidLabel('%% a note\nflowchart TD\n  title: Ingest pipeline')).toBe(
      'diagram: Ingest pipeline'
    );
    expect(mermaidLabel('   \n')).toBe('diagram');
  });
});

describe('MarkdownRenderer mermaid blocks', () => {
  beforeEach(() => {
    parse.mockReset().mockResolvedValue(true);
    renderDiagram.mockReset().mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="2"/></svg>',
    });
  });

  it('turns a language-mermaid code block into a diagram', async () => {
    const html = `<p>before</p><pre><code class="language-mermaid">${FLOWCHART}</code></pre>`;
    const { container } = render(
      <MemoryRouter>
        <MarkdownRenderer html={html} />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(container.querySelector('.mermaid-diagram svg')).not.toBeNull()
    );
    expect(container.querySelector('svg circle')).not.toBeNull();
  });

  it('leaves other fenced languages as code blocks', () => {
    const { container } = render(
      <MemoryRouter>
        <MarkdownRenderer html='<pre><code class="language-rust">fn main() {}</code></pre>' />
      </MemoryRouter>
    );
    expect(container.querySelector('.mermaid-diagram')).toBeNull();
    expect(container.querySelector('code.language-rust')).not.toBeNull();
  });
});

describe('MarkdownSource mermaid fences', () => {
  beforeEach(() => {
    parse.mockReset().mockResolvedValue(true);
    renderDiagram.mockReset().mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line x1="0" y1="0" x2="4" y2="4"/></svg>',
    });
  });

  it('draws a ```mermaid fence and leaves other fences alone', async () => {
    const markdown = [
      '# Pipeline',
      '',
      '```mermaid',
      FLOWCHART,
      '```',
      '',
      '```rust',
      'fn main() {}',
      '```',
    ].join('\n');

    const { container } = render(
      <MemoryRouter>
        <MarkdownSource markdown={markdown} />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(container.querySelector('.mermaid-diagram svg line')).not.toBeNull()
    );
    expect(container.querySelectorAll('.mermaid-diagram')).toHaveLength(1);
    expect(container.querySelector('pre code.language-rust')).not.toBeNull();
  });
});

describe('parseDiagramSvg', () => {
  it('hands back the root of a sanitized diagram', () => {
    const root = parseDiagramSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="2"/></svg>'
    );
    expect(root.nodeName.toLowerCase()).toBe('svg');
    expect(root.querySelector('rect')).not.toBeNull();
  });

  it('says so when sanitizing leaves nothing to draw', () => {
    expect(() => parseDiagramSvg('<script>window.x = true;</script>')).toThrow(
      'sanitizing the rendered diagram left nothing to draw'
    );
  });

  it('says so when the sanitized diagram is not well-formed', () => {
    // `&nbsp;` has no definition in XML, so the SVG parser refuses the document.
    expect(() =>
      parseDiagramSvg('<svg xmlns="http://www.w3.org/2000/svg">&nbsp;</svg>')
    ).toThrow('the sanitized diagram is not well-formed SVG');
  });

  it('names the root element when it is not an svg', () => {
    // Only a sanitizer change could produce this, so stand in for one.
    const sanitize = vi
      .spyOn(DOMPurify, 'sanitize')
      .mockReturnValue('<circle r="2"/>');
    try {
      expect(() => parseDiagramSvg('<svg/>')).toThrow(
        "the rendered diagram's root element is <circle>, not <svg>"
      );
    } finally {
      sanitize.mockRestore();
    }
  });
});
