import { describe, expect, it } from 'vitest';

import { classifySource, fieldValue, parseSourceList, statusTone } from '../wikiSources';

describe('parseSourceList', () => {
  it('splits a bracketed list at top-level commas only', () => {
    expect(
      parseSourceList('[raw/a.md, raw/b.md (§2, §3), acme-deploy docs/x.md, live checks on node-a 2026-10-01]')
    ).toEqual(['raw/a.md', 'raw/b.md (§2, §3)', 'acme-deploy docs/x.md', 'live checks on node-a 2026-10-01']);
    expect(parseSourceList('raw/a.md, raw/b.md')).toEqual(['raw/a.md', 'raw/b.md']);
    expect(parseSourceList('[]')).toEqual([]);
  });
});

describe('classifySource', () => {
  it('reads a bare path as a file of the wiki repository, keeping its note in the text', () => {
    expect(classifySource('raw/2026-10-01-notes.md')).toEqual({
      text: 'raw/2026-10-01-notes.md',
      target: { kind: 'wiki-repo', path: 'raw/2026-10-01-notes.md' },
    });
    expect(classifySource('raw/state.md (§12b for I1–I7)').target).toEqual({
      kind: 'wiki-repo',
      path: 'raw/state.md',
    });
  });

  it('reads "<repo> <path>" as another repository, with the path when it is one', () => {
    expect(classifySource('acme-deploy docs/governed.md').target).toEqual({
      kind: 'repo',
      repo: 'acme-deploy',
      path: 'docs/governed.md',
    });
    expect(classifySource('acme-fleet docs/decisions/').target).toEqual({
      kind: 'repo',
      repo: 'acme-fleet',
      path: 'docs/decisions/',
    });
    expect(classifySource('acme-app deploy/config/*.env and deploy/run.sh').target).toEqual({
      kind: 'repo',
      repo: 'acme-app',
      path: null,
    });
  });

  it('leaves a note as text when no repository has that name (decided when rendering)', () => {
    expect(classifySource('live checks on node-a 2026-10-01').target).toEqual({
      kind: 'repo',
      repo: 'live',
      path: null,
    });
    expect(classifySource('notes').target).toBeNull();
  });
});

describe('statusTone and fieldValue', () => {
  it('colours current as success, drafts as warning, stale as danger', () => {
    expect(statusTone('current')).toBe('success');
    expect(statusTone('Draft')).toBe('warning');
    expect(statusTone('superseded')).toBe('danger');
    expect(statusTone('someday')).toBe('neutral');
  });

  it('finds a field without case and treats blank as absent', () => {
    const fields: Array<[string, string]> = [['Status', 'current'], ['summary', ' ']];
    expect(fieldValue(fields, 'status')).toBe('current');
    expect(fieldValue(fields, 'summary')).toBeNull();
    expect(fieldValue(fields, 'updated')).toBeNull();
  });
});
