// PageHeader.test.tsx — the one header: one <h1>, a breadcrumb that starts at
// the page's nav parent, and a stamp that says how old what you read is.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { PageHeader, queryFreshness } from '..';

function at(markup: JSX.Element): HTMLElement {
  render(<MemoryRouter>{markup}</MemoryRouter>);
  const header = document.querySelector<HTMLElement>('[data-page-header]');
  if (!header) throw new Error('no [data-page-header] rendered');
  return header;
}

describe('PageHeader', () => {
  it('renders one h1 inside the header', () => {
    const header = at(<PageHeader title="Runners" />);
    expect(header.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Runners'
    );
  });

  it('has no breadcrumb when the page has no parent', () => {
    at(<PageHeader title="Runners" />);
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });

  it('starts a detail page’s breadcrumb at its nav parent', () => {
    at(
      <PageHeader
        title="20261003-021117"
        parent="nav.work"
        viewerIsAdmin
        crumbs={[
          { label: 'acme', to: '/work?family=acme' },
          { label: '20261003-021117' }
        ]}
      />
    );
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const first = crumbs.querySelectorAll('a')[0];
    expect(first.textContent).toBe('Work');
    expect(first.getAttribute('href')).toBe('/work');
  });

  it('names an admin-only parent without linking it for anyone else', () => {
    at(
      <PageHeader
        title="20261003-021117"
        parent="nav.work"
        crumbs={[{ label: '20261003-021117' }]}
      />
    );
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs).toHaveTextContent('Work');
    expect(crumbs.querySelector('a[href="/work"]')).toBeNull();
  });

  it('names an unknown parent in no crumb at all', () => {
    at(<PageHeader title="Somewhere" parent="nav.nowhere" />);
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });

  it('says when the page was read, and carries the instant itself', () => {
    const read = Date.parse('2026-10-04T12:00:00Z');
    vi.setSystemTime(read + 5 * 60_000);
    at(
      <PageHeader
        title="Runners"
        freshness={{ updatedAt: read, onRefresh: () => undefined }}
      />
    );
    const stamp = screen.getByTestId('page-freshness');
    expect(stamp.textContent).toContain('5 min ago');
    expect(stamp.getAttribute('data-updated-at')).toBe('2026-10-04T12:00:00Z');
    vi.useRealTimers();
  });

  it('says a page that has not been read yet has not been', () => {
    at(<PageHeader title="Runners" freshness={{ updatedAt: null }} />);
    expect(screen.getByTestId('page-freshness').textContent).toBe(
      'Not read yet'
    );
    expect(screen.queryByTestId('page-refresh')).toBeNull();
  });

  it('reads again when Refresh is pressed, and holds the button while it does', async () => {
    const refetch = vi.fn();
    at(
      <PageHeader
        title="Runners"
        freshness={queryFreshness({
          dataUpdatedAt: Date.now(),
          isFetching: false,
          refetch
        })}
      />
    );
    await userEvent.click(screen.getByTestId('page-refresh'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('says it is refreshing while a read is in flight', () => {
    at(
      <PageHeader
        title="Runners"
        freshness={{
          updatedAt: Date.now(),
          isFetching: true,
          onRefresh: () => undefined
        }}
      />
    );
    expect(screen.getByTestId('page-freshness').textContent).toContain(
      'Refreshing'
    );
    expect(screen.getByTestId('page-refresh')).toBeDisabled();
  });

  it('puts the actions and the subtitle in the header, badges beside the title', () => {
    const header = at(
      <PageHeader
        title="Repositories"
        subtitle="Every repository on this forge."
        badges={<span>12</span>}
        actions={<button type="button">Create repo</button>}
      />
    );
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'Create repo' })
    );
    expect(header.textContent).toContain('Every repository on this forge.');
    expect(header.querySelector('.page-header__title-line')?.textContent).toBe(
      'Repositories12'
    );
  });
});
