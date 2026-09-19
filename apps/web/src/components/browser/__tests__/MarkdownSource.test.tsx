import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { MarkdownSource, resolveMarkdownHref } from '../MarkdownSource';

const README = `# bullet-kernel

Control-plane monolith. Agents start at [\`AGENTS.md\`](AGENTS.md).
This line continues the same paragraph.

## Layout

| Path | Role |
| --- | --- |
| \`crates/domain\` | IDs and tokens |

<script>alert(1)</script>
`;

describe('MarkdownSource', () => {
  it('renders GFM tables, headings and joined paragraphs', () => {
    const { container } = render(
      <MemoryRouter>
        <MarkdownSource markdown={README} linkBase="/repos/jeryu/root/bullet-kernel/blob/main/" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'AGENTS.md' })).toHaveAttribute(
      'href',
      '/repos/jeryu/root/bullet-kernel/blob/main/AGENTS.md'
    );
    expect(container.querySelector('script')).toBeNull();
  });

  it('parses HTML written in a README and sanitizes it: a badge renders, nothing executes', () => {
    const hostile = [
      '<img alt="Jankurai" src="https://img.shields.io/badge/jankurai-audit-blue.svg">',
      '<img alt="boom" src="x" onerror="alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '<iframe src="https://evil.example"></iframe>',
      '<div onclick="alert(1)" style="position:fixed">overlay</div>',
      '<form action="https://evil.example"><input name="pw"></form>',
      '<script>alert(1)</script>',
    ].join('\n\n');
    const { container } = render(
      <MemoryRouter>
        <MarkdownSource markdown={hostile} linkBase="/repos/jeryu/root/r/blob/main/" />
      </MemoryRouter>
    );
    // The badge the owner asked about is an image again (or its alt chip once it fails to load).
    expect(container.innerHTML).toContain('Jankurai');
    // Nothing that can run or phone home with credentials survives.
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input[name="pw"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror|onclick|javascript:/i);
    expect(container.innerHTML).not.toMatch(/position:\s*fixed/i);
  });

  it('resolves only relative links', () => {
    const base = '/repos/jeryu/root/r/blob/main/';
    expect(resolveMarkdownHref('docs/testing.md', base)).toBe('/repos/jeryu/root/r/blob/main/docs/testing.md');
    expect(resolveMarkdownHref('../x.md', '/repos/jeryu/root/r/blob/main/docs/')).toBe('/repos/jeryu/root/r/blob/main/x.md');
    expect(resolveMarkdownHref('https://example.com', base)).toBe('https://example.com');
    expect(resolveMarkdownHref('#layout', base)).toBe('#layout');
    expect(resolveMarkdownHref('docs/a.md')).toBe('docs/a.md');
  });
});
