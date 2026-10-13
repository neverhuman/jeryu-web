import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/client';
import type { useSignupPolicy } from '../../hooks/useSignupPolicy';
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

interface StartStub {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
}

function mutation(): MutationStub {
  return { mutateAsync: vi.fn(), isPending: false, error: null };
}

function start(over: Partial<StartStub> = {}): StartStub {
  return { mutate: vi.fn(), isPending: false, isSuccess: false, error: null, ...over };
}

const auth = {
  login: mutation(),
  signupStart: start(),
  changePassword: mutation(),
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => auth,
}));

type PolicyView = ReturnType<typeof useSignupPolicy>;
const OPEN: PolicyView = { state: 'known', mode: 'email', waitlist: null };
let policy: PolicyView = OPEN;

vi.mock('../../hooks/useSignupPolicy', () => ({
  useSignupPolicy: () => policy,
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
    auth.signupStart = start();
    policy = OPEN;
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
    type('Username', 'operator');
    type('Password', SIGN_IN);
    fireEvent.click(screen.getByLabelText('Remember me'));
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/needs-you'));
    expect(auth.login.mutateAsync).toHaveBeenCalledWith({
      login: 'operator',
      password: SIGN_IN,
      rememberMe: true,
    });
  });

  it('stays put when the server still requires a password change', async () => {
    auth.login.mutateAsync.mockResolvedValue({ role: 'user', mustChangePassword: true });
    renderPage();
    type('Username', 'operator');
    type('Password', SIGN_IN);
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(auth.login.mutateAsync).toHaveBeenCalled());
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('while sign-up is closed, the tab is a link to an external waitlist, never a form', () => {
    policy = {
      state: 'known',
      mode: 'closed',
      waitlist: { href: 'https://waitlist.example.com/join', host: 'waitlist.example.com' },
    };
    renderPage({ initialMode: 'signup' });
    expect(screen.getByTestId('signup-closed')).toHaveTextContent('JeRyū is invite-only for now.');
    const link = screen.getByRole('link', { name: 'Join the waitlist' });
    expect(link).toHaveAttribute('href', 'https://waitlist.example.com/join');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(link).toHaveAccessibleDescription('Opens waitlist.example.com, a separate site.');
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send sign-up link' })).toBeNull();
  });

  it('while sign-up is closed with no external waitlist, links to the forge\'s own form', () => {
    policy = { state: 'known', mode: 'closed', waitlist: null };
    renderPage({ initialMode: 'signup' });
    expect(screen.getByRole('link', { name: 'Join the waitlist' })).toHaveAttribute(
      'href',
      '/waitlist'
    );
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('shows no form until the policy is known', () => {
    policy = { state: 'loading' };
    renderPage({ initialMode: 'signup' });
    expect(screen.getByRole('status')).toHaveTextContent('Checking how to join');
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('turns to the waitlist when the forge refuses a start with signup_closed', () => {
    auth.signupStart = start({
      error: new ApiError(403, { code: 'signup_closed', message: 'sign-up is closed' }),
    });
    renderPage({ initialMode: 'signup' });
    expect(screen.getByRole('link', { name: 'Join the waitlist' })).toBeVisible();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('starts sign-up with an email address only, and no account is created yet', () => {
    renderPage({ initialMode: 'signup' });
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByLabelText('Remember me')).toBeNull();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    type('Email', ' newcomer@example.com ');
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-up link' }));

    expect(auth.signupStart.mutate).toHaveBeenCalledWith({ email: 'newcomer@example.com' });
    expect(auth.login.mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('says to check email once the link is on its way', () => {
    auth.signupStart = start({ isSuccess: true });
    renderPage({ initialMode: 'signup' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Check your email. A link to finish creating your account is on its way; it works for one day.'
    );
  });

  it.each([
    [
      503,
      'mail_unavailable',
      'This forge cannot send email yet, so sign-up is closed. Ask an administrator for an account.',
    ],
    [429, 'rate_limited', 'Too many attempts. Try again later.'],
    [422, 'invalid_input', 'Enter a whole email address, like name@example.com.'],
  ])('says what a %i refusal of the sign-up link means', (status, code, copy) => {
    auth.signupStart = start({ error: new ApiError(status, { code, message: 'server words' }) });
    renderPage({ initialMode: 'signup' });
    expect(screen.getByRole('alert')).toHaveTextContent(copy);
  });

  it('offers "Forgot password?" on Login only', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).toBeNull();
  });

  it('switches tabs from Login to Sign up', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    expect(screen.getByRole('button', { name: 'Send sign-up link' })).toBeTruthy();
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
