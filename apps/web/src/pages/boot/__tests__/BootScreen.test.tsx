import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));
vi.mock('../LoginPanel', () => ({
  LoginPanel: () => <div data-testid="login-panel" />,
}));

import { BootScreen } from '../BootScreen';

describe('BootScreen header', () => {
  it('offers Log in but no Sign up on the single-operator forge', () => {
    render(<BootScreen />);
    const nav = screen.getByRole('navigation', { name: 'Account access' });
    expect(nav.textContent).toContain('Log in');
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull();
  });
});
