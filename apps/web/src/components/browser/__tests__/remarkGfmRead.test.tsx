import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { remarkGfmRead } from '../remarkGfmRead';

describe('GFM reader parity', () => {
  it.each([
    ['headings', '# Heading\n\n## Heading\n\nText with **bold** and *emphasis*.'],
    ['tables', '| left | right |\n| :--- | ---: |\n| **bold** | escaped \\| pipe |'],
    ['task lists', '- [x] complete\n- [ ] pending\n  - [x] nested'],
    ['autolinks', 'https://example.com/path?a=b and www.example.com and hello@example.com'],
    ['strikethrough', '~~deleted~~ and ~single~ and **~~nested~~**'],
    ['footnotes', 'One[^note] and again[^note].\n\n[^note]: Footnote **content**.'],
    ['fences', '```typescript\nconst x = "<script>";\n```\n\n`<img src=x>`'],
    ['untrusted HTML', '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>'],
    ['untrusted URLs', '[bad](javascript:alert%281%29) ![bad](data:text/html,test)'],
    ['heading collisions', '# Résumé\n# Résumé\n# user-content-x\n# 中文'],
  ])('renders %s identically to remark-gfm', (_name, markdown) => {
    const render = (plugin: typeof remarkGfmRead) => renderToStaticMarkup(
      <ReactMarkdown remarkPlugins={[plugin]} rehypePlugins={[rehypeSlug, rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    );
    expect(render(remarkGfmRead)).toBe(render(remarkGfm));
  });
});
