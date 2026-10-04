import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { NotFoundPage } from '../NotFoundPage';

describe('NotFoundPage', () => {
  it('says where a moved page went and links there', () => {
    render(
      <MemoryRouter initialEntries={['/audit']}>
        <Routes>
          <Route
            path="/audit"
            element={
              <NotFoundPage movedTo={{ what: 'Events are on Activity.', label: 'Open Activity', to: '/activity' }} />
            }
          />
          <Route path="/activity" element={<div data-testid="activity" />} />
        </Routes>
      </MemoryRouter>,
    );
    // The header names the page; the state surface says what is missing and where it went.
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByText('/audit no longer has its own page.')).toBeTruthy();
    expect(screen.getByText('Events are on Activity.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Activity' }));
    expect(screen.getByTestId('activity')).toBeTruthy();
  });

  it('keeps the generic message for unknown paths', () => {
    render(
      <MemoryRouter initialEntries={['/nowhere']}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Back to home' })).toBeTruthy();
    expect(screen.getByText("We couldn't find /nowhere.")).toBeTruthy();
  });
});
