// AccountRecoveryPages.test.tsx — the signed-out pages account emails lead to,
// the Settings email section, and the sign-in form's way into them.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../account/AccountRecoveryPages';
import { EmailSection } from '../account/EmailSection';
import { json } from './shiftPageHelpers';

type Call = { method: string; path: string; body: unknown };

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
    calls.push(call);
    return answer(call);
  });
  return calls;
}

function refusal(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

function open(path: string, element: JSX.Element, route: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('ForgotPasswordPage', () => {
  it('asks for a reset link and says the same thing whoever the address belongs to', async () => {
    const calls = serve(() => json({ result: 'sent' }, 202));
    open('/forgot-password', <ForgotPasswordPage />, '/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' me@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If an account has verified that address, a reset link is on its way.'
    );
    expect(calls).toEqual([
      { method: 'POST', path: '/api/v1/auth/password/forgot', body: { email: 'me@example.com' } },
    ]);
  });

  it('says to wait when the forge rate-limits the request', async () => {
    serve(() => refusal(429, 'rate_limited', 'slow down'));
    open('/forgot-password', <ForgotPasswordPage />, '/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Too many attempts.');
  });
});

describe('ResetPasswordPage', () => {
  const fill = (password: string, confirm = password): void => {
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Repeat it'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
  };

  it('sets the password with the emailed token, then sends the person to log in', async () => {
    const calls = serve(() => json({ result: 'reset' }));
    open('/reset-password?token=tok-1', <ResetPasswordPage />, '/reset-password');
    fill('a long new password');
    expect(await screen.findByRole('heading', { name: 'Your password is set' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByText(/Every session and every personal API token/)).toBeVisible();
    expect(screen.getByText(/re-issue any personal tokens/)).toBeVisible();
    expect(screen.getByText(/use team agent tokens/)).toBeVisible();
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/auth/password/reset',
        body: { token: 'tok-1', newPassword: 'a long new password' },
      },
    ]);
  });

  it('checks length and the repeat before spending the link', () => {
    const calls = serve(() => json({}));
    open('/reset-password?token=tok-1', <ResetPasswordPage />, '/reset-password');
    fill('short');
    expect(screen.getByRole('status')).toHaveTextContent('Use at least 12 characters.');
    fill('a long new password', 'a different one!!');
    expect(screen.getByRole('status')).toHaveTextContent('The two passwords are not the same.');
    expect(calls).toEqual([]);
  });

  it('offers a fresh link when the token is expired, spent or unknown', async () => {
    serve(() => refusal(422, 'reset_link_invalid', 'that reset link is expired'));
    open('/reset-password?token=old', <ResetPasswordPage />, '/reset-password');
    fill('a long new password');
    expect(await screen.findByRole('heading', { name: 'This link no longer works' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Send a new reset link' })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });

  it('keeps the form when the forge refuses the password itself (the link is not spent)', async () => {
    serve(() => refusal(422, 'password_too_weak', 'that password is on a breach list'));
    open('/reset-password?token=tok-1', <ResetPasswordPage />, '/reset-password');
    fill('password123456');
    expect(await screen.findByRole('status')).toHaveTextContent('that password is on a breach list');
    expect(screen.getByRole('button', { name: 'Set password' })).toBeEnabled();
  });

  it('without a token it says it needs the email link', () => {
    serve(() => json({}));
    open('/reset-password', <ResetPasswordPage />, '/reset-password');
    expect(screen.getByRole('status')).toHaveTextContent('This page needs the link from a reset email.');
  });
});

describe('VerifyEmailPage', () => {
  it('spends the link once on opening and says the address is verified', async () => {
    const calls = serve(() => json({ result: 'verified', verified: true }));
    open('/verify-email?token=v-1', <VerifyEmailPage />, '/verify-email');
    expect(await screen.findByRole('heading', { name: 'Your email address is verified' })).toBeVisible();
    expect(calls).toEqual([{ method: 'POST', path: '/api/v1/auth/email/verify', body: { token: 'v-1' } }]);
  });

  it('sends a dead link to Settings to ask for another', async () => {
    serve(() => refusal(422, 'verification_link_invalid', 'expired'));
    open('/verify-email?token=old', <VerifyEmailPage />, '/verify-email');
    expect(await screen.findByRole('heading', { name: 'This link no longer works' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings#email-section'
    );
  });
});

describe('EmailSection', () => {
  it('adds an address, says a link was sent, and shows it as not verified', async () => {
    let stored: { address: string | null; verified: boolean } = { address: null, verified: false };
    const calls = serve((call) => {
      if (call.method === 'PUT') {
        stored = { address: (call.body as { address: string }).address, verified: false };
        return json({ result: 'sent', verified: false }, 202);
      }
      return json(stored);
    });
    open('/settings', <EmailSection />, '/settings');
    expect(await screen.findByText(/No address yet/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'me@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add and verify' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'A verification link is on its way to me@example.com.'
    );
    await waitFor(() =>
      expect(screen.getByTestId('account-email-current')).toHaveTextContent('me@example.com not verified')
    );
    expect(calls.find((c) => c.method === 'PUT')).toEqual({
      method: 'PUT',
      path: '/api/v1/auth/email',
      body: { address: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/v1/auth/email/verify/resend')).toBe(true)
    );
  });

  it('shows a verified address without a resend button', async () => {
    serve(() => json({ address: 'me@example.com', verified: true }));
    open('/settings', <EmailSection />, '/settings');
    await waitFor(() =>
      expect(screen.getByTestId('account-email-current')).toHaveTextContent('me@example.com verified')
    );
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change and verify' })).toBeVisible();
  });

  it('is absent against a forge without account email routes', async () => {
    const calls = serve(() => refusal(404, 'not_found', 'no such route'));
    open('/settings', <EmailSection />, '/settings');
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Email' })).toBeNull());
  });
});
