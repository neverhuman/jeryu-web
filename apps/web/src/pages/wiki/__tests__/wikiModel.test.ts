import { describe, expect, it } from 'vitest';

import type { BlameResponse } from '../../../api/types/wiki';
import {
  buildPageTree,
  linkWikiReferences,
  pageLabel,
  pageTitle,
  resolveDocLink,
  resolvePagePath,
  sectionNote,
  splitFrontmatter,
  splitSections,
  wikiHref,
  wikiScope,
} from '../wikiModel';

const REPO = [
  'index.md',
  'README.md',
  'raw/source-notes.md',
  'wiki/README.md',
  'wiki/guides/index.md',
  'wiki/guides/setup.md',
  'wiki/guides/deep/tuning.md',
  'wiki/log.md',
];
const SCOPE = wikiScope(REPO);
const blob = (path: string): string => `/repos/jeryu/acme/handbook/blob/main/${path}`;

describe('wikiScope', () => {
  it('is the start page plus the Markdown under wiki/, nothing else', () => {
    expect(SCOPE.home).toBe('index.md');
    expect(SCOPE.pages).toEqual([
      'wiki/README.md',
      'wiki/guides/deep/tuning.md',
      'wiki/guides/index.md',
      'wiki/guides/setup.md',
      'wiki/log.md',
    ]);
  });

  it('starts on wiki/README.md when there is no index.md, and on nothing without either', () => {
    expect(wikiScope(['README.md', 'wiki/README.md', 'wiki/a.md']).home).toBe('wiki/README.md');
    expect(wikiScope(['README.md', 'wiki/a.md']).home).toBeNull();
    expect(wikiScope(['index.md', 'notes.md']).pages).toEqual([]);
  });
});

describe('resolvePagePath and wikiHref', () => {
  it('maps /wiki to the start page and /wiki/<path> into wiki/', () => {
    expect(resolvePagePath('', SCOPE)).toBe('index.md');
    expect(resolvePagePath('guides/setup.md', SCOPE)).toBe('wiki/guides/setup.md');
    expect(resolvePagePath('guides', SCOPE)).toBe('wiki/guides/index.md');
    expect(resolvePagePath('README.md', SCOPE)).toBe('wiki/README.md');
  });

  it('never opens a file outside wiki/', () => {
    expect(resolvePagePath('../raw/source-notes.md', SCOPE)).toBeNull();
    expect(resolvePagePath('raw/source-notes.md', SCOPE)).toBeNull();
    expect(resolvePagePath('guides/deep', SCOPE)).toBeNull();
    expect(resolvePagePath('', wikiScope(['wiki/a.md']))).toBeNull();
  });

  it('gives the start page /wiki and the others their path inside wiki/', () => {
    expect(wikiHref('index.md', SCOPE)).toBe('/wiki');
    expect(wikiHref('wiki/guides/a b.md', SCOPE)).toBe('/wiki/guides/a%20b.md');
    const readmeHome = wikiScope(['wiki/README.md']);
    expect(wikiHref('wiki/README.md', readmeHome)).toBe('/wiki');
  });
});

describe('resolveDocLink', () => {
  it('keeps wiki pages in the wiki and sends every other file to the repository', () => {
    expect(resolveDocLink('wiki/guides/setup.md', 'index.md', SCOPE, blob)).toBe('/wiki/guides/setup.md');
    expect(resolveDocLink('setup.md#steps', 'wiki/guides/index.md', SCOPE, blob)).toBe(
      '/wiki/guides/setup.md#steps'
    );
    expect(resolveDocLink('../../index.md', 'wiki/guides/setup.md', SCOPE, blob)).toBe('/wiki');
    expect(resolveDocLink('guides/', 'wiki/README.md', SCOPE, blob)).toBe('/wiki/guides/index.md');
    expect(resolveDocLink('raw/source-notes.md', 'index.md', SCOPE, blob)).toBe(
      blob('raw/source-notes.md')
    );
    expect(resolveDocLink('../scripts/lint.py', 'wiki/log.md', SCOPE, blob)).toBe(blob('scripts/lint.py'));
  });

  it('leaves anchors, absolute paths and external links alone', () => {
    for (const href of ['#top', '/activity', 'https://example.test/a', 'mailto:ops@example.test']) {
      expect(resolveDocLink(href, 'wiki/log.md', SCOPE, blob)).toBe(href);
    }
  });
});

describe('page names', () => {
  it('names the start page Home, wiki/README Overview, folders by name', () => {
    expect(pageLabel('index.md', SCOPE)).toBe('Home');
    expect(pageLabel('wiki/README.md', SCOPE)).toBe('Overview');
    expect(pageLabel('wiki/guides/index.md', SCOPE)).toBe('Guides');
    expect(pageLabel('wiki/guides/release-checklist.md', SCOPE)).toBe('Release checklist');
    expect(pageLabel('wiki/README.md', wikiScope(['wiki/README.md']))).toBe('Home');
  });

  it('prefers the frontmatter title, then the first heading', () => {
    expect(pageTitle('a.md', splitFrontmatter('---\ntitle: "Runbook"\n---\n# Other\n'))).toBe('Runbook');
    expect(pageTitle('a.md', splitFrontmatter('Intro\n\n# Deploying ##\n'))).toBe('Deploying');
    expect(pageTitle('wiki/on-call.md', splitFrontmatter('no heading'))).toBe('On call');
  });
});

describe('buildPageTree', () => {
  it('nests folders inside wiki/ and lists index pages first', () => {
    const tree = buildPageTree(SCOPE.pages);
    expect(tree.pages).toEqual(['wiki/README.md', 'wiki/log.md']);
    expect(tree.folders.map((folder) => folder.path)).toEqual(['wiki/guides']);
    expect(tree.folders[0].pages).toEqual(['wiki/guides/index.md', 'wiki/guides/setup.md']);
    expect(tree.folders[0].folders[0].pages).toEqual(['wiki/guides/deep/tuning.md']);
  });
});

describe('splitFrontmatter', () => {
  it('takes key/value pairs and folds list items into their key', () => {
    const page = splitFrontmatter('---\ntitle: Setup\ntags:\n  - ops\n  - deploy\nstatus: draft\n---\n# Setup\n');
    expect(page.fields).toEqual([
      ['title', 'Setup'],
      ['tags', 'ops, deploy'],
      ['status', 'draft'],
    ]);
    expect(page.body).toBe('# Setup\n');
    expect(page.offset).toBe(7);
  });

  it('leaves a page without a closed block alone', () => {
    expect(splitFrontmatter('---\nnot closed').offset).toBe(0);
    expect(splitFrontmatter('# Plain').fields).toEqual([]);
  });
});

describe('splitSections', () => {
  it('cuts at headings outside code fences, counting file lines', () => {
    const body = [
      'Intro line',
      '',
      '## First',
      'text',
      '```sh',
      '# not a heading',
      '```',
      '## Second',
      'more [docs][d]',
      '',
      '[d]: https://example.test/docs',
    ].join('\n');
    const sections = splitSections(body, 4);
    expect(sections.map((s) => [s.startLine, s.endLine, s.heading])).toEqual([
      [5, 6, null],
      [7, 11, 'First'],
      [12, 15, 'Second'],
    ]);
    expect(sections[1].markdown).toContain('# not a heading');
    // A reference definition reaches every section, so its link still resolves.
    expect(sections[0].markdown).toContain('[d]: https://example.test/docs');
    expect(sections[2].markdown.match(/\[d\]:/g)).toHaveLength(1);
  });

  it('drops sections that hold only blank lines', () => {
    expect(splitSections('\n\n# Only\n')).toHaveLength(1);
  });
});

describe('linkWikiReferences', () => {
  it('links names to wiki pages and keeps code, misses and outside files as written', () => {
    const out = linkWikiReferences(
      'See [[setup]], [[guides/deep/tuning|tuning notes]], [[index]] or [[missing]] and [[source-notes]].\n`[[setup]]`\n```\n[[setup]]\n```',
      SCOPE
    );
    expect(out).toBe(
      'See [setup](/wiki/guides/setup.md), [tuning notes](/wiki/guides/deep/tuning.md), [index](/wiki) or [[missing]] and [[source-notes]].\n`[[setup]]`\n```\n[[setup]]\n```'
    );
  });
});

describe('sectionNote', () => {
  const blame: BlameResponse = {
    ref: 'main',
    sha: 'c'.repeat(40),
    path: 'a.md',
    line_count: 6,
    hunks: [
      { start_line: 1, line_count: 3, commit: 'a' },
      { start_line: 4, line_count: 1, commit: 'b' },
      { start_line: 5, line_count: 2, commit: 'a' },
    ],
    commits: [
      { sha: 'b', summary: 'docs: step two', author: 'Bea', authored_at: '2026-02-01T00:00:00Z', boundary: false },
      { sha: 'a', summary: 'docs: first', author: 'Ada', authored_at: '2026-01-01T00:00:00Z', boundary: true },
    ],
  };

  it('names the newest and oldest commit behind a line range', () => {
    const note = sectionNote(blame, 3, 5);
    expect(note?.latest.author).toBe('Bea');
    expect(note?.earliest.author).toBe('Ada');
    expect(note?.commitCount).toBe(2);
    expect(sectionNote(blame, 5, 6)?.commitCount).toBe(1);
    expect(sectionNote(blame, 9, 12)).toBeNull();
  });
});
