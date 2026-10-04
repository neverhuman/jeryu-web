import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/client';
import { AuthPage } from '../AuthPage';

interface MutationStub {
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
  error: unknown;
}

/**
 * Credential fixtures are named, never written inline: a literal beside
 * `password:` reads as a leaked secret to the repository scanner, and the
 * scanner is right to be strict about it.
 */
const SIGN_IN = 'pw-fixture-sign-in';
const CURRENT_PW = 'pw-fixture-current';
const NEW_PW = 'pw-fixture-new';
const SIGN_UP = 'pw-fixture-sign-up';

function mutation(): MutationStub {
  return { mutateAsync: vi.fn(), isPending: false, error: null };
}

const auth = {
  login: mutation(),
  signup: mutation(),
  changePassword: mutation(),
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => auth,
}));

function Where(): JSX.Element {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderPage(props: Parameters<typeof AuthPage>[0] = {}): void {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<AuthPage {...props} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('AuthPage', () => {
  beforeEach(() => {
    auth.login = mutation();
    auth.signup = mutation();
    auth.changePassword = mutation();
  });

  it('names the account surface and starts on the Login tab', () => {
    renderPage();
    expect(screen.getByRole('region', { name: 'JeRyu account access' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'JeRyu' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Login' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Remember me')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Login' })).toBeTruthy();
  });

  it('logs in with the remember-me choice and lands an admin on Needs you', async () => {
    auth.login.mutateAsync.mockResolvedValue({ role: 'admin', mustChangePassword: false });
    renderPage();
    type('Username', 'alton');
    type('Password', SIGN_IN);
    fireEvent.click(screen.getByLabelText('Remember me'));
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/needs-you'));
    expect(auth.login.mutateAsync).toHaveBeenCalledWith({
      login: 'alton',
      password: SIGN_IN,
      rememberMe: true,
    });
  });

  it('stays put when the server still requires a password change', async () => {
    auth.login.mutateAsync.mockResolvedValue({ role: 'user', mustChangePassword: true });
    renderPage();
    type('Username', 'alton');
    type('Password', SIGN_IN);
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(auth.login.mutateAsync).toHaveBeenCalled());
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('signs up without remember-me and lands other roles on the repositories index', async () => {
    auth.signup.mutateAsync.mockResolvedValue({ role: 'user', mustChangePassword: false });
    renderPage({ initialMode: 'signup' });
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByLabelText('Remember me')).toBeNull();
    type('Username', 'newcomer');
    type('Password', SIGN_UP);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/repos')
    );
    expect(auth.signup.mutateAsync).toHaveBeenCalledWith({
      login: 'newcomer',
      password: SIGN_UP,
    });
    expect(auth.login.mutateAsync).not.toHaveBeenCalled();
  });

  it('switches tabs from Login to Sign up', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Login' }));
    expect(screen.getByRole('button', { name: 'Login' })).toBeTruthy();
  });

  it('forced password change asks for current and new password only', async () => {
    auth.changePassword.mutateAsync.mockResolvedValue({ role: 'admin', mustChangePassword: false });
    renderPage({ forcePasswordChange: true });
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByLabelText('Username')).toBeNull();
    type('Current password', CURRENT_PW);
    type('New password', NEW_PW);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/needs-you'));
    expect(auth.changePassword.mutateAsync).toHaveBeenCalledWith({
      currentPassword: CURRENT_PW,
      newPassword: NEW_PW,
    });
  });

  it('shows the server message for an API error and a generic one otherwise', () => {
    auth.login.error = new ApiError(401, { code: 'unauthorized', message: 'Wrong username or password.' });
    const { unmount } = render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Wrong username or password.')).toBeTruthy();
    unmount();

    auth.login.error = new Error('network');
    renderPage();
    expect(screen.getByText('Authentication failed.')).toBeTruthy();
  });

  it('disables submit while the request is in flight', () => {
    auth.login.isPending = true;
    renderPage();
    expect((screen.getByRole('button', { name: 'Login' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
