import { describe, expect, it } from 'vitest';

import {
  ancestorsOf,
  commitCountLabel,
  asksForFilesOpen,
  blobPath,
  folderToReveal,
  healthChipLabel,
  healthOpensChecks,
  initialPanelOpen,
  openPullsLabel,
  OPEN_FILES_STATE,
  panelChoiceText,
  parsePanelChoice,
  parseRefAndPath,
  refCountsLabel,
  repoFrontPath,
  revealFolderState,
} from '../repoBrowserModel';

describe('repoBrowserModel', () => {
  it('builds the front page and file URLs with one spelling', () => {
    expect(repoFrontPath('jeryu', 'root/bullet-kernel')).toBe('/repos/jeryu/root/bullet-kernel');
    expect(blobPath('jeryu', 'root/bullet-kernel', 'main', 'docs/testing.md')).toBe(
      '/repos/jeryu/root/bullet-kernel/blob/main/docs/testing.md'
    );
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

  it('remembers the panel choice and otherwise decides by width', () => {
    expect(parsePanelChoice('open')).toBe(true);
    expect(parsePanelChoice('closed')).toBe(false);
    expect(parsePanelChoice(null)).toBeNull();
    expect(parsePanelChoice('yes')).toBeNull();
    expect(panelChoiceText(true)).toBe('open');
    expect(panelChoiceText(false)).toBe('closed');
    expect(initialPanelOpen(null, 1440)).toBe(true);
    expect(initialPanelOpen(null, 1099)).toBe(false);
    expect(initialPanelOpen('closed', 1440)).toBe(false);
    expect(initialPanelOpen('open', 600)).toBe(true);
  });

  it('reads the open-files request from navigation state without trusting its shape', () => {
    expect(asksForFilesOpen(OPEN_FILES_STATE)).toBe(true);
    expect(asksForFilesOpen(null)).toBe(false);
    expect(asksForFilesOpen('open')).toBe(false);
    expect(asksForFilesOpen({ files: 'closed' })).toBe(false);
    // A folder link opens the panel and that folder.
    expect(revealFolderState('docs/adr/')).toEqual({ files: 'open', reveal: 'docs/adr' });
    expect(asksForFilesOpen(revealFolderState('docs'))).toBe(true);
    expect(folderToReveal(revealFolderState('docs/adr/'))).toBe('docs/adr');
    expect(folderToReveal({ reveal: 7 })).toBeNull();
    expect(folderToReveal(OPEN_FILES_STATE)).toBeNull();
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
