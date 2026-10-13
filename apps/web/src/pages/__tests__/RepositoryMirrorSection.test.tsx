import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AutomationMirror } from '../../api/types';
import { RepositoryMirrorSection } from '../RepositoryMirrorSection';

function mirror(overrides: Partial<AutomationMirror> = {}): AutomationMirror {
  return {
    target: 'https://github.example/acme/widget-api',
    direction: 'push',
    refs: ['refs/heads/main', 'refs/tags/*'],
    state: 'behind',
    behind: true,
    behindBy: 3,
    retryPending: true,
    forgeHead: '1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21',
    lastPushedSha: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a09',
    lastPushedAt: '2026-09-29T09:30:00Z',
    lastCheckedAt: '2026-09-30T09:30:00Z',
    lastError: 'push rejected: no key on this host',
    tagDrift: [],
    ...overrides,
  };
}

describe('RepositoryMirrorSection', () => {
  it('links the GitHub target and states direction, refs, behind state and the error', () => {
    render(<RepositoryMirrorSection mirrors={[mirror()]} />);

    const section = screen.getByTestId('settings-mirror');
    const link = within(section).getByRole('link', { name: 'Mirrored to GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.example/acme/widget-api');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(section).toHaveTextContent('forge → GitHub (push), the forge is the source of truth');
    expect(section).toHaveTextContent('refs/heads/main, refs/tags/*');
    expect(section).toHaveTextContent('3 commits behind (retrying)');
    expect(section).toHaveTextContent('9a8b7c6');
    expect(section).toHaveTextContent('push rejected: no key on this host');
    expect(section).toHaveTextContent('No tag drift.');
    expect(section).toHaveClass('mirror-section--warn');
  });

  it('marks diverged and tag drift red with needs you', () => {
    render(
      <RepositoryMirrorSection
        mirrors={[
          mirror({
            state: 'diverged',
            behind: false,
            retryPending: false,
            tagDrift: [
              {
                ref: 'refs/tags/v1.2.3',
                forgeSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                mirrorSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              },
            ],
          }),
        ]}
      />
    );

    const section = screen.getByTestId('settings-mirror');
    expect(section).toHaveClass('mirror-section--human');
    expect(section).toHaveTextContent('diverged; needs you');
    expect(section).toHaveTextContent('refs/tags/v1.2.3');
    expect(section).toHaveTextContent('aaaaaaa');
    expect(section).toHaveTextContent('bbbbbbb');
  });

  it('says Not mirrored when the repository is unenrolled', () => {
    render(<RepositoryMirrorSection mirrors={[]} />);
    expect(screen.getByTestId('settings-mirror')).toHaveTextContent('Not mirrored');
  });

  it('does not link a target whose scheme is not http(s)', () => {
    const scriptScheme = ['java', 'script:alert(1)'].join('');
    render(<RepositoryMirrorSection mirrors={[mirror({ target: scriptScheme })]} />);
    const section = screen.getByTestId('settings-mirror');
    expect(within(section).queryByRole('link')).toBeNull();
    expect(section).toHaveTextContent('Mirrored to mirror');
  });
});
