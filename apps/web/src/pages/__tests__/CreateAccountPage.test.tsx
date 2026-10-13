// CreateAccountPage.test.tsx — sign-up, step two: the page a mailed sign-up
// link opens. The real AuthProvider runs, so a created account is a session.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../../hooks/useAuth';
import { CreateAccountPage } from '../account/CreateAccountPage';
import { json } from './shiftPageHelpers';

type Call = { method: string; path: string; body: unknown };

/** Named, never inline beside `password:`: the secret scanner is right to be strict. */
const CHOSEN = 'pw-fixture-chosen-0001';

function serve(answer: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://forge.test');
    const raw = init?.body;
    const call = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      body: typeof raw === 'string' ? JSON.parse(raw) : undefined,
    };
    if (call.path === '/api/v1/auth/me') {
      return json({ error: { code: 'unauthorized', message: 'login required' } }, 401);
    }
    calls.push(call);
    return answer(call);
  });
  return calls;
}

function refusal(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

function Home(): JSX.Element {
  const { user } = useAuth();
  return <p data-testid="home">signed in as {user?.login ?? 'nobody'}</p>;
}

function open(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/create-account" element={<CreateAccountPage />} />
            <Route path="/" element={<Home />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function fill(login: string, password: string, confirm = password): void {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: login } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Repeat password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

afterEach(() => vi.restoreAllMocks());

describe('CreateAccountPage', () => {
  it('creates the account with the mailed token, signs in, and goes home', async () => {
    const calls = serve(() =>
      json({ login: 'newcomer', role: 'user', mustChangePassword: false, csrfToken: 'csrf-1' })
    );
    open('/create-account?token=signup-1');
    fill(' newcomer ', CHOSEN);
    expect(await screen.findByTestId('home')).toHaveTextContent('signed in as newcomer');
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/auth/signup',
        body: { token: 'signup-1', login: 'newcomer', password: CHOSEN },
      },
    ]);
  });

  it('checks length and the repeat before spending the link', () => {
    const calls = serve(() => json({}));
    open('/create-account?token=signup-1');
    fill('newcomer', 'short');
    expect(screen.getByRole('status')).toHaveTextContent('Use at least 12 characters.');
    fill('newcomer', CHOSEN, `${CHOSEN}-other`);
    expect(screen.getByRole('status')).toHaveTextContent('The two passwords are not the same.');
    expect(calls).toEqual([]);
  });

  it('keeps the form when the username is taken, since the link still works', async () => {
    const calls = serve(() => refusal(409, 'conflict', 'login already exists'));
    open('/create-account?token=signup-1');
    fill('taken', CHOSEN);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'That username is taken. Choose another.'
    );
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(calls).toHaveLength(1);
  });

  it('shows the server words when it refuses the password itself', async () => {
    serve(() => refusal(422, 'invalid_input', 'password must be at least 12 characters'));
    open('/create-account?token=signup-1');
    fill('newcomer', CHOSEN);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'password must be at least 12 characters'
    );
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it.each(['signup_link_invalid', 'email_required'])(
    'sends a spent link (%s) back to start sign-up again',
    async (code) => {
      serve(() => refusal(422, code, 'that sign-up link is expired'));
      open('/create-account?token=old');
      fill('newcomer', CHOSEN);
      expect(
        await screen.findByRole('heading', { name: 'This link no longer works' })
      ).toBeVisible();
      expect(screen.getByRole('link', { name: 'Start sign-up again' })).toHaveAttribute(
        'href',
        '/signup'
      );
    }
  );

  it('shows the waitlist when sign-up closed after the link went out', async () => {
    serve((call) =>
      call.path === '/api/v1/auth/signup/policy'
        ? json({ mode: 'closed', waitlistUrl: 'https://waitlist.example.com/join' })
        : json(
            {
              error: { code: 'signup_closed', message: 'sign-up is closed' },
              waitlistUrl: 'https://waitlist.example.com/join',
            },
            403
          )
    );
    open('/create-account?token=signup-1');
    fill('newcomer', CHOSEN);
    expect(await screen.findByRole('heading', { name: 'Sign-up is closed' })).toBeVisible();
    expect(screen.getByText(/JeRyū is invite-only for now/)).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Join the waitlist' })).toHaveAttribute(
      'href',
      'https://waitlist.example.com/join'
    );
  });

  it('without a token it says it needs the email link', () => {
    const calls = serve(() => json({}));
    open('/create-account');
    expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'This page needs the link from a sign-up email.'
    );
    expect(calls).toEqual([]);
  });

  it('says to wait when the forge rate-limits the attempt', async () => {
    serve(() => refusal(429, 'rate_limited', 'slow down'));
    open('/create-account?token=signup-1');
    fill('newcomer', CHOSEN);
    expect(await screen.findByRole('status')).toHaveTextContent('Too many attempts.');
  });
});
