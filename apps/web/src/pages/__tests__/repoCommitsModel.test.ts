import { describe, expect, it } from 'vitest';

import {
  COMMITS_PAGE_SIZE,
  commitPath,
  commitsPath,
  historyRangeLabel,
  historyTitle,
  parsePageParam,
} from '../repoCommitsModel';

describe('repoCommitsModel', () => {
  it('builds the commits list path, with a ref and a path when given', () => {
    expect(commitsPath('jeryu', 'acme/widget')).toBe('/repos/jeryu/acme/widget/commits');
    expect(commitsPath('jeryu', 'acme/widget', 'main')).toBe(
      '/repos/jeryu/acme/widget/commits/main'
    );
    expect(commitsPath('jeryu', 'acme/widget', 'release/1.x', 'src/main.rs')).toBe(
      '/repos/jeryu/acme/widget/commits/release%2F1.x?path=src%2Fmain.rs'
    );
  });

  it('builds one commit\'s path', () => {
    expect(commitPath('jeryu', 'acme/widget', 'a'.repeat(40))).toBe(
      `/repos/jeryu/acme/widget/commit/${'a'.repeat(40)}`
    );
  });

  it('reads `?page=`, refusing anything that is not a page', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam('0')).toBe(1);
    expect(parsePageParam('-2')).toBe(1);
    expect(parsePageParam('two')).toBe(1);
    expect(parsePageParam('1.5')).toBe(1);
  });

  it('says which commits of how many are on the page', () => {
    expect(historyRangeLabel(1, 30, 30, 1204)).toBe('Commits 1–30 of 1,204');
    expect(historyRangeLabel(3, 30, 4, 64)).toBe('Commits 61–64 of 64');
    expect(historyRangeLabel(1, 30, 0, 0)).toBe('No commits');
    expect(COMMITS_PAGE_SIZE).toBeGreaterThan(1);
  });

  it('names the ref, or the file whose history it is', () => {
    expect(historyTitle('main', '')).toBe('Commits on main');
    expect(historyTitle('main', 'src/main.rs')).toBe('History of src/main.rs');
  });
});
