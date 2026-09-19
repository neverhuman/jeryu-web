import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { RepoSwitcher, repoNameFromPath } from '../RepoSwitcher';

describe('repoNameFromPath', () => {
  it('names the repository a path is inside, never an id', () => {
    expect(repoNameFromPath('/repos/jeryu/jeryu/jeryu-deploy')).toBe('jeryu/jeryu-deploy');
    expect(repoNameFromPath('/repos/jeryu/veox/jain-deploy/blob/main/README.md')).toBe(
      'veox/jain-deploy'
    );
    expect(repoNameFromPath('/repos')).toBeNull();
    expect(repoNameFromPath('/repos/new')).toBeNull();
    expect(repoNameFromPath('/repos/family/jeryu-split')).toBeNull();
    expect(repoNameFromPath('/needs-you')).toBeNull();
  });
});

describe('RepoSwitcher', () => {
  it('links to the repository list and shows the current repository by name', () => {
    render(
      <MemoryRouter initialEntries={['/repos/jeryu/jeryu/jeryu-web/pulls/38']}>
        <RepoSwitcher />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'jeryu/jeryu-web: switch repository' });
    expect(link).toHaveAttribute('href', '/repos');
    expect(link).toHaveTextContent('jeryu/jeryu-web');
  });

  it('reads Repositories outside a repository', () => {
    render(
      <MemoryRouter initialEntries={['/needs-you']}>
        <RepoSwitcher />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'All repositories' })).toHaveTextContent('Repositories');
  });
});
