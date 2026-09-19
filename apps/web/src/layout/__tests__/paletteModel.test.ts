import { describe, expect, it } from 'vitest';

import {
  parsePullQuery,
  pullTargets,
  repoFrontPage,
  repositoryTargets,
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
