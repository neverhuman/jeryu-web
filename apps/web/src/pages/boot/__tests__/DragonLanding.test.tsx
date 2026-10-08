import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DragonLanding } from '../DragonLanding';

beforeEach(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  window.matchMedia = vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => false,
  }));
});
afterEach(() => { cleanup(); document.documentElement.removeAttribute('data-theme'); });

describe('DragonLanding', () => {
  it('serves one complete responsive illustration without motion layers', () => {
    render(<DragonLanding />);
    const image = screen.getByTestId('dragon-poster');
    expect(image).toHaveAttribute('srcset', expect.stringContaining('640w'));
    expect(image).toHaveAttribute('width');
    expect(image).toHaveAttribute('height');
    expect(image).toHaveAccessibleName(/Japanese dragon/);
    expect(screen.queryByTestId('dragon-layers')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Animate dragon' })).toBeNull();
  });

  it('keeps the same transparent scene when the theme changes', async () => {
    render(<DragonLanding />);
    const source = screen.getByTestId('dragon-poster').getAttribute('src');
    expect(source).toContain('dragon-graphic');
    await act(async () => { document.documentElement.setAttribute('data-theme', 'light'); });
    expect(screen.getByTestId('dragon-poster')).toHaveAttribute('src', source);
  });

  it('keeps a useful state after an image failure and permits a retry', async () => {
    const user = userEvent.setup();
    render(<DragonLanding />);
    fireEvent.error(screen.getByTestId('dragon-poster'));
    expect(screen.getByRole('status')).toHaveTextContent('could not load');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('dragon-poster')).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
