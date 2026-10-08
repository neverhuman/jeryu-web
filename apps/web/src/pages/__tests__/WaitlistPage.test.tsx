import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { WaitlistPage } from '../WaitlistPage';

describe('WaitlistPage', () => {
  it('offers registration without an auth provider or account', () => {
    render(<MemoryRouter initialEntries={['/waitlist']}><WaitlistPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Be part of/ })).toBeVisible();
    expect(screen.getByLabelText('Email')).toBeVisible();
    expect(screen.getByTestId('dragon-landing')).toBeVisible();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /Back to the story/ })).toHaveAttribute('href', '/');
  });
});
