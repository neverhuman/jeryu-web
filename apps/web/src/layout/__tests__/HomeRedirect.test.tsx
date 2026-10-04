import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { HomeRedirect, NEEDS_YOU_PATH, REPOS_HOME_PATH, homePathFor } from '../HomeRedirect';

const auth = vi.hoisted((): { role: string | null } => ({ role: null }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: auth.role === null ? null : { login: 'ada', role: auth.role } }),
}));

function Where(): JSX.Element {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderHome(role: string | null): void {
  auth.role = role;
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomeRedirect', () => {
  it('sends an admin to the list of what waits on a person', () => {
    expect(homePathFor({ role: 'admin' })).toBe(NEEDS_YOU_PATH);
    renderHome('admin');
    expect(screen.getByTestId('where').textContent).toBe('/needs-you');
  });

  // "Needs you" reads an admin-only endpoint, and no install's own family may
  // be the app's idea of home: the repositories index is the one page every
  // signed-in viewer may read, wherever the app is installed.
  it('sends every other role, and an unknown one, to the repositories index', () => {
    expect(REPOS_HOME_PATH).toBe('/repos');
    expect(homePathFor({ role: 'user' })).toBe(REPOS_HOME_PATH);
    expect(homePathFor(null)).toBe(REPOS_HOME_PATH);
    expect(homePathFor({})).toBe(REPOS_HOME_PATH);
    renderHome('user');
    expect(screen.getByTestId('where').textContent).toBe('/repos');
  });
});
