import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RepositorySummary } from '../../api/types';
import {
  normalizeSection,
  sectionTitleFor,
  SETTINGS_SECTIONS,
} from '../repositorySettingsModel';
import {
  AccessSectionView,
  GeneralSectionView,
} from '../repositorySettingsSections';

function summary(over: Partial<RepositorySummary> = {}): RepositorySummary {
  return {
    id: { id: 'repo-1', host: 'acme', owner: 'acme', name: 'widget-api' },
    entity: { kind: 'repository', id: 'repo-1' },
    description: null,
    visibility: 'internal',
    default_branch: 'release',
    family: 'acme',
    archived: false,
    repo_role: null,
    topics: [],
    language: null,
    health: 'healthy',
    open_pull_requests: 0,
    failing_checks: 0,
    running_jobs: 0,
    active_agents: 0,
    blocked_agents: 0,
    updated_at: '2026-10-01T12:00:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
    ...over,
  };
}

describe('settings sections', () => {
  it('names every section it lists', () => {
    expect(SETTINGS_SECTIONS.map(sectionTitleFor)).toEqual([
      'General',
      'Branch protection',
      'Mirror',
      'Access',
      'Danger zone',
    ]);
  });

  it('reads a section a studio once served as General', () => {
    expect(normalizeSection('merge-policy')).toBe('general');
    expect(normalizeSection(undefined)).toBe('general');
    expect(normalizeSection('danger-zone')).toBe('danger-zone');
  });

  it('General states the facts the forge serves', () => {
    render(<GeneralSectionView repo={summary()} canWrite />);
    expect(screen.getByText('release')).toBeInTheDocument();
    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.getByText('internal')).toBeInTheDocument();
    expect(screen.getByText('no')).toBeInTheDocument();
    expect(
      screen.getByText(/changes these through its own API/)
    ).toBeInTheDocument();
  });

  it('General says so when the viewer may only read', () => {
    render(
      <GeneralSectionView repo={summary({ archived: true })} canWrite={false} />
    );
    expect(
      screen.getByText('yes — the repository is read-only')
    ).toBeInTheDocument();
    expect(screen.getByText(/needs repo.admin/)).toBeInTheDocument();
  });

  it('Access lists the grants, and says nothing when it may not read them', () => {
    const grants = [
      {
        login: '@widget-merge-bot',
        access: 'write',
        grantedBy: '@acme-admin',
        grantedAt: '2026-09-28T10:00:00Z',
      },
    ];
    const { unmount } = render(
      <AccessSectionView grants={grants} visible />
    );
    expect(screen.getByText('@widget-merge-bot')).toBeInTheDocument();
    expect(screen.getByText('write')).toBeInTheDocument();
    unmount();

    render(<AccessSectionView grants={[]} visible={false} />);
    expect(
      screen.getByTestId('settings-access-hidden')
    ).toBeInTheDocument();
  });
});
