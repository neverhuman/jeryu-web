import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiDelete, apiDeleteReceipt, apiGet, apiSend } from '../api/client';
import { ProviderSignIn } from './ProviderSignIn';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiGet: vi.fn(),
  apiSend: vi.fn(),
  apiDelete: vi.fn(),
  apiDeleteReceipt: vi.fn(),
}));

const PENDING = {
  login_id: 'pl_1',
  provider: 'claude',
  provider_account: 'max-plan',
  state: 'pending',
  interval: 1,
  expires_at: '2026-10-10T20:15:00Z',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://auth.example/device',
  verification_uri_complete: 'https://auth.example/device?code=WDJB-MJHT',
};

const CONNECTED = {
  ...PENDING,
  state: 'connected',
  user_code: undefined,
  verification_uri: undefined,
  verification_uri_complete: undefined,
  connection: {
    id: 'pc_1',
    owner_id: 'user/alice',
    provider: 'claude',
    provider_account: 'max-plan',
    credential_kind: 'oauth_refresh',
    state: 'connected',
    connection_generation: 1,
    secret_version: 0,
    created_at: '2026-10-10T20:00:00Z',
    updated_at: '2026-10-10T20:00:00Z',
    refreshed_at: null,
  },
};

/** A cancelled sign-in as the server answers it: its code withdrawn. */
const CANCELLED = {
  ...PENDING,
  state: 'cancelled',
  user_code: undefined,
  verification_uri: undefined,
  verification_uri_complete: undefined,
};

/** The server's answer for a sign-in it does not have, as `client.ts` raises it. */
function missing(id: string): ApiError {
  return new ApiError(404, {
    code: 'provider_login_not_found',
    message: `no sign-in ${id} of yours`,
  });
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mount(onConnected = vi.fn(() => Promise.resolve())): typeof onConnected {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderSignIn onConnected={onConnected} />
    </QueryClientProvider>
  );
  return onConnected;
}

function signIn(account = 'max-plan'): void {
  const form = screen.getByRole('form', { name: 'Sign in with a subscription' });
  fireEvent.change(within(form).getByLabelText('Account label'), { target: { value: account } });
  fireEvent.click(within(form).getByRole('button', { name: 'Sign in' }));
}

describe('ProviderSignIn', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
    vi.mocked(apiDelete).mockReset();
    vi.mocked(apiDeleteReceipt).mockReset();
  });

  it('shows the code and the page, then reports the connection once it is made', async () => {
    vi.mocked(apiSend).mockResolvedValue(PENDING);
    vi.mocked(apiGet).mockResolvedValueOnce(PENDING).mockResolvedValue(CONNECTED);
    const onConnected = mount();
    const form = screen.getByRole('form', { name: 'Sign in with a subscription' });
    expect(within(form).getByRole('button', { name: 'Sign in' })).toBeDisabled();
    signIn(' max-plan ');
    expect(await screen.findByTestId('provider-sign-in-code')).toHaveTextContent('WDJB-MJHT');
    expect(apiSend).toHaveBeenCalledWith('/api/v1/me/provider-connections/login', {
      provider: 'claude',
      provider_account: 'max-plan',
    });
    const page = screen.getByRole('link', { name: 'https://auth.example/device' });
    expect(page).toHaveAttribute('href', 'https://auth.example/device');
    expect(page).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.getByRole('link', { name: 'open the page with the code filled in' })
    ).toHaveAttribute('href', 'https://auth.example/device?code=WDJB-MJHT');
    // A second sign-in waits for this one to end.
    expect(within(form).getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(
      await screen.findByText('Signed in Claude as max-plan', {}, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/me/provider-connections/login/pl_1',
      expect.anything()
    );
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('provider-sign-in-code')).not.toBeInTheDocument();
  });

  it('never links a page that is not an http(s) URL', async () => {
    // Built at run time: a script URL literal is itself refused by the lint.
    const script = ['javascript', 'alert(1)'].join(':');
    const evil = { ...PENDING, verification_uri: script, verification_uri_complete: undefined };
    vi.mocked(apiSend).mockResolvedValue(evil);
    vi.mocked(apiGet).mockResolvedValue(evil);
    mount();
    signIn();
    expect(await screen.findByTestId('provider-sign-in-pending')).toHaveTextContent(script);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('cancels a pending sign-in and says how it ended', async () => {
    vi.mocked(apiSend).mockResolvedValue(PENDING);
    vi.mocked(apiGet)
      .mockResolvedValueOnce(PENDING)
      .mockResolvedValue({ ...PENDING, state: 'cancelled', user_code: undefined });
    vi.mocked(apiDeleteReceipt).mockResolvedValue(CANCELLED);
    const onConnected = mount();
    signIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() =>
      expect(apiDeleteReceipt).toHaveBeenCalledWith('/api/v1/me/provider-connections/login/pl_1')
    );
    expect(
      await screen.findByText('The sign-in ended cancelled. Sign in again to retry.')
    ).toBeInTheDocument();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('withdraws a sign-in the server no longer has, stops reading, waits for Sign in', async () => {
    const next = { ...PENDING, login_id: 'pl_2', user_code: 'KPLX-RQZD' };
    vi.mocked(apiSend).mockResolvedValueOnce(PENDING).mockResolvedValueOnce(next);
    // The server has forgotten pl_1 (it restarted, say), and has forgotten
    // pl_2 too by the time it is cancelled.
    vi.mocked(apiGet).mockImplementation((url: string) =>
      url.endsWith('/pl_2') ? Promise.resolve(next) : Promise.reject(missing('pl_1'))
    );
    vi.mocked(apiDeleteReceipt).mockRejectedValue(missing('pl_2'));
    const onConnected = mount();
    const form = screen.getByRole('form', { name: 'Sign in with a subscription' });
    signIn();
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    // Its code and the provider's page are withdrawn; nothing says it was cancelled.
    await waitFor(() =>
      expect(screen.queryByTestId('provider-sign-in-code')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('provider-sign-in-gone')).toHaveTextContent(
      'The server no longer has the Claude sign-in for max-plan'
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel sign-in' })).not.toBeInTheDocument();
    expect(screen.queryByText(/cancelled/)).not.toBeInTheDocument();
    expect(apiDeleteReceipt).not.toHaveBeenCalled();
    // Reading pl_1 stops with that answer: nothing past the 1 s interval.
    await settle(1500);
    expect(apiGet).toHaveBeenCalledTimes(1);
    // Only Sign in opens another.
    expect(apiSend).toHaveBeenCalledTimes(1);
    fireEvent.click(within(form).getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByTestId('provider-sign-in-code')).toHaveTextContent('KPLX-RQZD');
    // A cancel the server answers the same way withdraws that one as well.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() =>
      expect(screen.queryByTestId('provider-sign-in-code')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('provider-sign-in-gone')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Nor is pl_2 read again past the 1 s interval, and none opens by itself.
    const reads = vi.mocked(apiGet).mock.calls.length;
    await settle(1500);
    expect(apiGet).toHaveBeenCalledTimes(reads);
    expect(apiSend).toHaveBeenCalledTimes(2);
    expect(onConnected).not.toHaveBeenCalled();
  });

  it.each([
    ['no network', new ApiError(0, { code: 'network_error', message: 'Failed to fetch' })],
    ['a 502', new ApiError(502, { code: 'internal', message: 'Bad Gateway' })],
    ['an untyped 404', new ApiError(404, { code: 'not_found', message: 'Not Found' })],
  ])('keeps a sign-in pending, and reads on, after %s', async (_failure, error) => {
    vi.mocked(apiSend).mockResolvedValue(PENDING);
    vi.mocked(apiGet).mockRejectedValue(error);
    mount();
    const form = screen.getByRole('form', { name: 'Sign in with a subscription' });
    signIn();
    // A read that failed says nothing about the sign-in: it stays as last known.
    expect(await screen.findByText('Could not read the sign-in')).toBeInTheDocument();
    expect(screen.getByTestId('provider-sign-in-code')).toHaveTextContent('WDJB-MJHT');
    expect(screen.getByRole('button', { name: 'Cancel sign-in' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.queryByTestId('provider-sign-in-gone')).not.toBeInTheDocument();
    const reads = vi.mocked(apiGet).mock.calls.length;
    await settle(1500);
    expect(vi.mocked(apiGet).mock.calls.length).toBeGreaterThan(reads);
  });

  it('shows the cancel as the server answered it, over a stale read and a failed one', async () => {
    let answerRead: (login: unknown) => void = () => undefined;
    vi.mocked(apiSend).mockResolvedValue(PENDING);
    vi.mocked(apiGet)
      // A read already on its way when the cancel lands...
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerRead = resolve;
          })
      )
      // ...and every read after it fails.
      .mockRejectedValue(new ApiError(0, { code: 'network_error', message: 'Failed to fetch' }));
    vi.mocked(apiDeleteReceipt).mockResolvedValue(CANCELLED);
    const onConnected = mount();
    signIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel sign-in' }));
    const ended = 'The sign-in ended cancelled. Sign in again to retry.';
    expect(await screen.findByText(ended)).toBeInTheDocument();
    // The older read answers pending only now: the cancel stands.
    answerRead(PENDING);
    await settle(100);
    expect(screen.getByText(ended)).toBeInTheDocument();
    expect(screen.queryByTestId('provider-sign-in-code')).not.toBeInTheDocument();
    expect(screen.queryByText(/Signed in/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel sign-in' })).not.toBeInTheDocument();
    expect(apiDeleteReceipt).toHaveBeenCalledTimes(1);
    expect(apiSend).toHaveBeenCalledTimes(1);
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('keeps a sign-in gone when a cancel sent before the 404 answers pending', async () => {
    let failRead: (error: unknown) => void = () => undefined;
    let answerCancel: (login: unknown) => void = () => undefined;
    vi.mocked(apiSend).mockResolvedValue(PENDING);
    vi.mocked(apiGet)
      // The read on its way when Cancel is pressed, answered below...
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failRead = reject;
          })
      )
      // ...and any read after it: the server no longer has pl_1.
      .mockRejectedValue(missing('pl_1'));
    vi.mocked(apiDeleteReceipt).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerCancel = resolve;
        })
    );
    const onConnected = mount();
    signIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() => expect(apiDeleteReceipt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    // With the cancel held, the read answers that the server no longer has pl_1...
    failRead(missing('pl_1'));
    expect(await screen.findByTestId('provider-sign-in-gone')).toBeInTheDocument();
    // ...then the held cancel answers pending: it reached the server while the
    // server was completing pl_1, before pl_1 was forgotten.
    answerCancel(PENDING);
    await settle(100);
    expect(screen.queryByTestId('provider-sign-in-code')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel sign-in' })).not.toBeInTheDocument();
    expect(screen.getByTestId('provider-sign-in-gone')).toBeInTheDocument();
    // Well past several 1 s intervals, pl_1 is not read again, nothing opens
    // another, and nothing claims it was cancelled or connected.
    await settle(3500);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('provider-sign-in-gone')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-sign-in-code')).not.toBeInTheDocument();
    expect(screen.queryByText(/cancelled|Signed in/)).not.toBeInTheDocument();
    expect(apiSend).toHaveBeenCalledTimes(1);
    expect(apiDeleteReceipt).toHaveBeenCalledTimes(1);
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('names the zone the deadline falls in, across a clock change', async () => {
    // 01:50 EDT on the night the clocks go back: fifteen minutes on is 01:05 EST.
    vi.useFakeTimers({ now: Date.parse('2026-11-01T05:50:00Z'), toFake: ['Date'] });
    try {
      const login = { ...PENDING, expires_at: '2026-11-01T06:05:00Z' };
      vi.mocked(apiSend).mockResolvedValue(login);
      vi.mocked(apiGet).mockResolvedValue(login);
      mount();
      signIn();
      expect(await screen.findByTestId('provider-sign-in-pending')).toHaveTextContent(
        'enter WDJB-MJHT before 01:05 EST (in 15 min).'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('names the clock time and zone a code must be entered by, not only its day', async () => {
    // This browser's clock, frozen at 16:30 EDT. It only words the deadline,
    // so a code it already puts in the past is still the server's open one.
    vi.useFakeTimers({ now: Date.parse('2026-10-10T20:30:00Z'), toFake: ['Date'] });
    try {
      const deadline = async (expires_at: string): Promise<string> => {
        const login = { ...PENDING, expires_at };
        vi.mocked(apiSend).mockResolvedValue(login);
        vi.mocked(apiGet).mockResolvedValue(login);
        mount();
        signIn();
        const shown = (await screen.findByTestId('provider-sign-in-pending')).textContent ?? '';
        cleanup();
        return shown;
      };
      const early = await deadline('2026-10-10T20:15:00Z');
      const late = await deadline('2026-10-10T20:45:00Z');
      expect(early).not.toBe(late);
      expect(early).toContain('enter WDJB-MJHT before 16:15 EDT.');
      expect(late).toContain('enter WDJB-MJHT before 16:45 EDT (in 15 min).');
      expect(apiDeleteReceipt).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says why a sign-in could not be opened', async () => {
    vi.mocked(apiSend).mockRejectedValue(new Error('claude cannot sign in here'));
    mount();
    signIn();
    expect(await screen.findByText('Could not open the sign-in')).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
