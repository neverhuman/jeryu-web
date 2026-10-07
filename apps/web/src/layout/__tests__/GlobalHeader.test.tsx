import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { GlobalHeader, liveNameFor } from '../GlobalHeader';

vi.mock('../../hooks/useBootstrap', () => ({
  useBootstrap: () => ({ data: { viewer: { login: 'ada', display_name: 'Ada' } } }),
}));
vi.mock('../RepoSwitcher', () => ({ RepoSwitcher: () => null }));
vi.mock('../UserMenu', () => ({ UserMenu: () => null }));
vi.mock('../../components/family/FamilyScopeChip', () => ({ FamilyScopeChip: () => null }));
vi.mock('../../stores/realtimeStore', () => ({
  useRealtimeStore: (select: (s: { status: string }) => unknown) => select({ status: 'open' }),
}));
vi.mock('../../stores/commandStore', () => ({
  useCommandStore: (select: (s: { open: () => void }) => unknown) => select({ open: () => {} }),
}));

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <GlobalHeader />
    </MemoryRouter>
  );
}

describe('GlobalHeader live pill', () => {
  it('links to Activity from anywhere else', () => {
    renderAt('/needs-you');
    const pill = screen.getByTestId('live-pill');
    expect(pill.tagName).toBe('A');
    expect(pill).toHaveAttribute('href', '/activity');
    expect(pill).toHaveAccessibleName(`${liveNameFor('open')}. Open Activity`);
  });

  it('is plain state on Activity, with nowhere to go', () => {
    renderAt('/activity');
    const pill = screen.getByTestId('live-pill');
    expect(pill.tagName).toBe('SPAN');
    expect(pill).not.toHaveAttribute('href');
    expect(pill).toHaveAttribute('title', liveNameFor('open'));
    expect(screen.queryByRole('link', { name: /Open Activity/ })).toBeNull();
    // The connection state is still announced once, by the status region.
    expect(screen.getByRole('status')).toHaveTextContent(liveNameFor('open'));
  });

  it('is plain state inside Activity too', () => {
    renderAt('/activity/usage');
    expect(screen.getByTestId('live-pill').tagName).toBe('SPAN');
  });
});
