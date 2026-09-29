import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Breadcrumbs } from '../Breadcrumbs';

function renderCrumbs(segments: Parameters<typeof Breadcrumbs>[0]['segments']) {
  return render(
    <MemoryRouter>
      <Breadcrumbs segments={segments} />
    </MemoryRouter>
  );
}

describe('Breadcrumbs', () => {
  it('says what a prefixed crumb names, in the page and to a screen reader', () => {
    renderCrumbs([
      { label: 'Repos', to: '/repos' },
      { label: 'jeryu', prefix: 'host', to: '/repos?host=jeryu' },
      { label: 'jeryu' },
    ]);
    // The link is announced as the host, so it is not a second "jeryu".
    expect(screen.getByRole('link', { name: 'host jeryu' })).toHaveAttribute(
      'href',
      '/repos?host=jeryu'
    );
    expect(screen.getByText('host')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'Repos' })).toBeInTheDocument();
  });

  it('leaves an unprefixed crumb as its own label, the last one inert', () => {
    renderCrumbs([{ label: 'Repos', to: '/repos' }, { label: 'jeryu-split' }]);
    expect(screen.queryByRole('link', { name: 'jeryu-split' })).toBeNull();
    expect(screen.getByText('jeryu-split')).toHaveAttribute('aria-current', 'page');
  });
});
