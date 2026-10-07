import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const reduced = vi.hoisted(() => ({ current: false }));

vi.mock('../../../hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => reduced.current,
}));

import { DragonLanding } from '../DragonLanding';

function installMedia(match: (query: string) => boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: match(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('DragonLanding', () => {
  it('keeps a still poster when motion is reduced', () => {
    reduced.current = true;
    installMedia(() => false);
    render(<DragonLanding />);
    expect(screen.getByTestId('dragon-poster')).toBeVisible();
    expect(screen.queryByTestId('dragon-layers')).toBeNull();
    expect(document.querySelector('.dragon-landing--motion')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Animate dragon' })).toBeNull();
  });

  it('mounts the layer group on a wide screen that allows motion', () => {
    reduced.current = false;
    installMedia(() => false);
    render(<DragonLanding />);
    expect(screen.getByTestId('dragon-layers')).toBeInTheDocument();
    expect(document.querySelector('.dragon-landing--motion')).not.toBeNull();
  });

  it('waits for Animate dragon on a narrow screen', async () => {
    reduced.current = false;
    installMedia((query) => query.includes('max-width'));
    const user = userEvent.setup();
    render(<DragonLanding />);
    expect(screen.queryByTestId('dragon-layers')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Animate dragon' }));
    expect(screen.getByTestId('dragon-layers')).toBeInTheDocument();
  });
});
