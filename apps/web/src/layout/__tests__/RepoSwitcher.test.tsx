import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { RepoSwitcher, repoHomeFromPath, repoNameFromPath } from '../RepoSwitcher';

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
  it('names the repository you are in and links to its front page', () => {
    render(
      <MemoryRouter initialEntries={['/repos/jeryu/jeryu/jeryu-web/pulls/38']}>
        <RepoSwitcher />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'jeryu/jeryu-web' });
    expect(link).toHaveAttribute('href', '/repos/jeryu/jeryu/jeryu-web');
    expect(link).toHaveTextContent('jeryu/jeryu-web');
  });

  it('renders nothing outside a repository: the left nav already has Repositories', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/needs-you']}>
        <RepoSwitcher />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
    expect(repoHomeFromPath('/repos/family/jeryu-split')).toBeNull();
  });
});
