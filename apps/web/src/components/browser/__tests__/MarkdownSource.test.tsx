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

  it('resolves only relative links', () => {
    const base = '/repos/jeryu/root/r/blob/main/';
    expect(resolveMarkdownHref('docs/testing.md', base)).toBe('/repos/jeryu/root/r/blob/main/docs/testing.md');
    expect(resolveMarkdownHref('../x.md', '/repos/jeryu/root/r/blob/main/docs/')).toBe('/repos/jeryu/root/r/blob/main/x.md');
    expect(resolveMarkdownHref('https://example.com', base)).toBe('https://example.com');
    expect(resolveMarkdownHref('#layout', base)).toBe('#layout');
    expect(resolveMarkdownHref('docs/a.md')).toBe('docs/a.md');
  });
});
