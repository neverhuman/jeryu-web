import { describe, expect, it } from 'vitest';

import {
  paletteScore,
  parsePullQuery,
  pullTargets,
  repoFrontPage,
  repositoryTargets,
  SEARCH_ALL_VALUE,
  type RepositoryRow,
} from '../paletteModel';

function rows(...names: string[]): RepositoryRow[] {
  return names.map((full) => {
    const [owner, name] = full.split('/');
    return { id: { host: 'jeryu', owner, name } };
  });
}

describe('paletteModel', () => {
  const repos = rows('veox/ai-veox-app', 'jeryu/jeryu-web', 'veox-ai/ai-veox-app', 'jeryu/jeryu-deploy');

  it('offers every repository by owner/name, sorted, linking to its front page', () => {
    const targets = repositoryTargets(repos);
    expect(targets.map((t) => t.label)).toEqual([
      'jeryu/jeryu-deploy',
      'jeryu/jeryu-web',
      'veox-ai/ai-veox-app',
      'veox/ai-veox-app',
    ]);
    expect(targets[1].path).toBe('/repos/jeryu/jeryu/jeryu-web');
    expect(repoFrontPage(repos[1])).toBe('/repos/jeryu/jeryu/jeryu-web');
  });

  it('names the forge each repository is on, not one of its own', () => {
    const elsewhere: RepositoryRow[] = [
      { id: { host: 'forge.example', owner: 'acme', name: 'widgets' } },
    ];
    expect(repoFrontPage(elsewhere[0])).toBe('/repos/forge.example/acme/widgets');
    expect(pullTargets('acme/widgets#4', elsewhere).map((t) => t.path)).toEqual([
      '/repos/forge.example/acme/widgets/pulls/4',
    ]);
  });

  it('reads owner/name#n and name#n, and nothing else', () => {
    expect(parsePullQuery('jeryu/jeryu-web#38')).toEqual({ repo: 'jeryu/jeryu-web', number: 38 });
    expect(parsePullQuery('  jeryu-web # 38 ')).toEqual({ repo: 'jeryu-web', number: 38 });
    expect(parsePullQuery('jeryu-web')).toBeNull();
    expect(parsePullQuery('#38')).toBeNull();
    expect(parsePullQuery('jeryu-web#0')).toBeNull();
    expect(parsePullQuery('a/b/c#1')).toBeNull();
  });

  it('opens the pull request in the repository that was named', () => {
    expect(pullTargets('jeryu/jeryu-web#38', repos)).toEqual([
      {
        id: 'pull:jeryu:jeryu/jeryu-web#38',
        label: 'Open pull request #38 in jeryu/jeryu-web',
        path: '/repos/jeryu/jeryu/jeryu-web/pulls/38',
      },
    ]);
    expect(pullTargets('JERYU-WEB#38', repos).map((t) => t.path)).toEqual(['/repos/jeryu/jeryu/jeryu-web/pulls/38']);
  });

  it('offers each repository that shares a bare name, and none for a name nobody has', () => {
    expect(pullTargets('ai-veox-app#1', repos).map((t) => t.label)).toEqual([
      'Open pull request #1 in veox-ai/ai-veox-app',
      'Open pull request #1 in veox/ai-veox-app',
    ]);
    expect(pullTargets('nope#1', repos)).toEqual([]);
    expect(pullTargets('jeryu-web', repos)).toEqual([]);
  });
});

describe('paletteScore', () => {
  const WORK = ['work', 'shift', 'queue', 'todo', 'todoq', 'tasks', 'workers', 'slots'];
  const SETTINGS = ['settings', 'admin', 'preferences', 'account'];

  it('keeps everything while nothing is typed', () => {
    expect(paletteScore('Go to Work', '', WORK)).toBe(1);
    expect(paletteScore('Go to Work', '   ', WORK)).toBe(1);
  });

  it('ranks the page that is named above the pages that merely share letters', () => {
    const settings = paletteScore('Go to Settings', 'settings', SETTINGS);
    expect(settings).toBeGreaterThan(0);
    // "s-e-t-t-i-n-g-s" is a subsequence of these titles and keywords; none of
    // them is what "settings" means, so none of them is offered at all.
    expect(paletteScore('Go to Work', 'settings', WORK)).toBe(0);
    expect(paletteScore('Go to Needs you', 'settings', ['needs you', 'attention'])).toBe(0);
    expect(paletteScore('Go to Releases', 'settings', ['release', 'deploy', 'staged'])).toBe(0);
  });

  it('puts the title before a keyword, and a whole word before a fragment', () => {
    expect(paletteScore('Add work', 'add work')).toBe(1);
    expect(paletteScore('Go to Work', 'work', WORK)).toBeGreaterThan(
      paletteScore('Go to Shared tools', 'work', ['fleet', 'workbench'])
    );
    expect(paletteScore('alice/jeryu-web', 'alice/je')).toBeGreaterThan(
      paletteScore('alice/jeryu-web', 'web')
    );
  });

  it('matches a repository by the half of its name that was typed', () => {
    expect(paletteScore('veox-ai/ai-veox-app', 'ai-veox')).toBeGreaterThan(0);
    expect(paletteScore('veox-ai/ai-veox-app', 'zzz')).toBe(0);
  });

  it('never scores the hand-off to the search page', () => {
    expect(paletteScore(SEARCH_ALL_VALUE, 'search')).toBe(0);
    expect(paletteScore(SEARCH_ALL_VALUE, 'all results')).toBe(0);
  });
});
