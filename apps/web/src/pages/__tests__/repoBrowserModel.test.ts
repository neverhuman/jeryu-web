import { describe, expect, it } from 'vitest';

import {
  ancestorsOf,
  commitCountLabel,
  blobPath,
  folderToReveal,
  healthChipLabel,
  healthOpensChecks,
  openPullsLabel,
  parseRefAndPath,
  refCountsLabel,
  REPO_TABS,
  repoFrontPath,
  repoRefOf,
  repoUrl,
  revealFolderState,
  treePath,
} from '../repoBrowserModel';

describe('repoBrowserModel', () => {
  it('builds the front page and file URLs with one spelling', () => {
    expect(repoFrontPath('jeryu', 'root/bullet-kernel')).toBe('/repos/jeryu/root/bullet-kernel');
    expect(blobPath('jeryu', 'root/bullet-kernel', 'main', 'docs/testing.md')).toBe(
      '/repos/jeryu/root/bullet-kernel/blob/main/docs/testing.md'
    );
  });

  it('names the forge from the data, on every tab', () => {
    const ref = { host: 'forge.example', owner: 'acme', name: 'widgets' };
    expect(repoUrl(ref)).toBe('/repos/forge.example/acme/widgets');
    expect(repoUrl(ref, 'pulls')).toBe('/repos/forge.example/acme/widgets/pulls');
    expect(repoUrl(ref, 'pulls', '12')).toBe('/repos/forge.example/acme/widgets/pulls/12');
    expect(repoUrl(ref, 'agents', 'run-42')).toBe(
      '/repos/forge.example/acme/widgets/agents/run-42'
    );
    expect(repoUrl(ref, 'blob', 'main/src/lib.rs')).toBe(
      '/repos/forge.example/acme/widgets/blob/main/src/lib.rs'
    );
    // Every tab the router dispatches is addressable, and each is one segment.
    for (const tab of REPO_TABS) {
      expect(repoUrl(ref, tab)).toBe(`/repos/forge.example/acme/widgets/${tab}`);
    }
  });

  it('encodes each segment of a ref taken from `owner/name`', () => {
    expect(repoRefOf('forge.example', 'odd owner/na me')).toEqual({
      host: 'forge.example',
      owner: 'odd owner',
      name: 'na me',
    });
    expect(repoUrl(repoRefOf('forge.example', 'odd owner/na me'))).toBe(
      '/repos/forge.example/odd%20owner/na%20me'
    );
    expect(repoRefOf('forge.example', 'bare')).toEqual({
      host: 'forge.example',
      owner: '',
      name: 'bare',
    });
    // A read model that names a repository bare leaves out the owner segment
    // rather than leaving an empty one in the path.
    expect(repoUrl(repoRefOf('forge.example', 'bare'))).toBe('/repos/forge.example/bare');
  });

  it('splits a blob splat into ref and path', () => {
    expect(parseRefAndPath('main/src/lib.rs')).toEqual({ ref: 'main', path: 'src/lib.rs' });
    expect(parseRefAndPath('main')).toEqual({ ref: 'main', path: '' });
    expect(parseRefAndPath('')).toEqual({ ref: '', path: '' });
  });

  it('lists the folders to open so a file is visible in the tree', () => {
    expect(ancestorsOf('crates/api/src/web.rs')).toEqual(['crates', 'crates/api', 'crates/api/src']);
    expect(ancestorsOf('README.md')).toEqual([]);
    expect(ancestorsOf('')).toEqual([]);
  });

  it('reads the folder to reveal from navigation state without trusting its shape', () => {
    expect(revealFolderState('docs/adr/')).toEqual({ reveal: 'docs/adr' });
    expect(folderToReveal(revealFolderState('docs/adr/'))).toBe('docs/adr');
    expect(folderToReveal({ reveal: 7 })).toBeNull();
    expect(folderToReveal(null)).toBeNull();
  });

  it('builds the tree route of a folder at a ref', () => {
    expect(treePath('jeryu', 'root/bullet-kernel', 'feat/x', 'docs/adr')).toBe(
      '/repos/jeryu/root/bullet-kernel/tree/feat%2Fx/docs/adr'
    );
  });

  it('says how many pull requests are open in words', () => {
    expect(openPullsLabel(0)).toBe('No open pull requests');
    expect(openPullsLabel(1)).toBe('1 open pull request');
    expect(openPullsLabel(4)).toBe('4 open pull requests');
  });

  it('counts the commits of the shown ref, and the branches and tags', () => {
    expect(commitCountLabel(1)).toBe('1 commit');
    expect(commitCountLabel(1204)).toBe('1,204 commits');
    expect(commitCountLabel(0)).toBe('0 commits');
    expect(refCountsLabel([{ kind: 'branch' }, { kind: 'branch' }, { kind: 'tag' }])).toBe(
      '2 branches · 1 tag'
    );
    expect(refCountsLabel([{ kind: 'branch' }])).toBe('1 branch');
    expect(refCountsLabel([{ kind: 'tag' }, { kind: 'tag' }])).toBe('2 tags');
    expect(refCountsLabel([])).toBe('');
  });

  it('says what set the health chip, and opens it only when checks are behind it', () => {
    expect(healthOpensChecks({ health: 'warning', failing_checks: 2 })).toBe(true);
    expect(healthOpensChecks({ health: 'warning', failing_checks: 0 })).toBe(false);
    expect(healthOpensChecks({ health: 'healthy', failing_checks: 3 })).toBe(false);
    expect(healthChipLabel('warning', 1)).toBe('warning · 1 failing check');
    expect(healthChipLabel('needs_work', 3)).toBe('needs work · 3 failing checks');
  });
});
