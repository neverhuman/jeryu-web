import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WaitlistPage } from '../WaitlistPage';
import { json } from './shiftPageHelpers';

function policyAnswers(response: () => Response): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/waitlist']}>
        <WaitlistPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('WaitlistPage', () => {
  it('offers registration without an auth provider or account', async () => {
    policyAnswers(() => json({ mode: 'closed', waitlistUrl: null }));
    renderPage();
    expect(screen.getByRole('heading', { name: /Be part of/ })).toBeVisible();
    expect(await screen.findByLabelText('Email')).toBeVisible();
    expect(screen.getByTestId('dragon-landing')).toBeVisible();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /Back to the story/ })).toHaveAttribute('href', '/');
  });

  it('keeps the forge\'s own form against an older forge without the policy route', async () => {
    policyAnswers(() => json({ error: { code: 'not_found', message: 'no route' } }, 404));
    renderPage();
    expect(await screen.findByLabelText('Email')).toBeVisible();
  });

  it('says the waitlist could not be checked when the forge errors, and tries again', async () => {
    let answers = 0;
    policyAnswers(() => {
      answers += 1;
      return answers <= 2
        ? json({ error: { code: 'unavailable', message: 'down' } }, 503)
        : json({ mode: 'closed', waitlistUrl: null });
    });
    renderPage();
    expect(
      await screen.findByRole('alert', {}, { timeout: 4_000 })
    ).toHaveTextContent('Could not check whether sign-up is open.');
    expect(screen.queryByLabelText('Email')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Email')).toBeVisible();
  });

  it('links to the operator\'s waitlist instead of taking the address here', async () => {
    policyAnswers(() =>
      json({ mode: 'closed', waitlistUrl: 'https://waitlist.example.com/join' })
    );
    renderPage();
    const link = await screen.findByRole('link', { name: 'Join the waitlist' });
    expect(link).toHaveAttribute('href', 'https://waitlist.example.com/join');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByTestId('waitlist-external')).toHaveTextContent(
      'Opens waitlist.example.com, a separate site.'
    );
    expect(screen.queryByLabelText('Email')).toBeNull();
  });
});
