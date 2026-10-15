import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Ref } from 'react';

vi.mock('../LoginPanel', () => ({
  LoginPanel: ({ firstFieldRef }: { firstFieldRef?: Ref<HTMLInputElement> }) => <input aria-label="Username" ref={firstFieldRef} />,
}));

import { BootScreen } from '../BootScreen';

describe('BootScreen public story', () => {
  it('paints the story immediately and moves registration behind the navigation link', () => {
    render(<MemoryRouter><BootScreen /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Git for agents.' })).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Account access' });
    expect(nav.textContent).toContain('Log in');
    const joins = screen.getAllByRole('link', { name: /Join waitlist/ });
    // The navigation pill, the hero pill and the footer link all open the public waitlist.
    expect(joins).toHaveLength(3);
    joins.forEach((join) => expect(join).toHaveAttribute('href', '/waitlist'));
    expect(screen.getByRole('link', { name: /See how it works/ })).toHaveAttribute('href', '#how-it-works');
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(document.querySelector('form')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull();
  });

  it('opens the native auth surface, focuses it, without losing the shared artwork', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><BootScreen /></MemoryRouter>);
    const source = screen.getByTestId('dragon-poster').getAttribute('src');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByLabelText('Username')).toHaveFocus();
    // The hero call to action yields to the form; the navigation pill and footer link stay.
    expect(screen.getAllByRole('link', { name: /Join waitlist/ })).toHaveLength(2);
    expect(screen.getByTestId('dragon-landing')).toBeVisible();
    expect(screen.getByTestId('dragon-poster')).toHaveAttribute('src', source);
    await user.click(screen.getByRole('button', { name: /Back to the story/ }));
    expect(screen.getByTestId('dragon-landing')).toBeVisible();
    expect(screen.queryByLabelText('Username')).toBeNull();
  });

  it('retains the destination when opened for a protected deep link', () => {
    render(<MemoryRouter><BootScreen initialAuthOpen returnTo="/settings" /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('/settings');
    expect(screen.getByLabelText('Username')).toHaveFocus();
    expect(screen.getByRole('link', { name: /Back to the story/ })).toHaveAttribute('href', '/');
  });
});
