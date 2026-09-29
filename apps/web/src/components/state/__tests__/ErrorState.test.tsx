// ErrorState.test.tsx — the failure surface says words, not whole UUIDs.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../../../api/client';
import { ErrorState } from '../ErrorState';

const ID = '428377c2-6190-4a50-b306-d52d4a2f1c33';

describe('ErrorState', () => {
  it('renders the message as given when it names no id', () => {
    render(<ErrorState title="Could not load settings" description="Try again." />);
    const description = screen.getByText('Try again.');
    expect(description.getAttribute('title')).toBeNull();
  });

  it('shortens ids in the message and the request id, keeping both in the title', () => {
    const error = new ApiError(404, {
      code: 'not_found',
      message: `No repository ${ID}.`,
      request_id: ID,
    });
    render(<ErrorState title="Could not load settings" error={error} />);
    const description = screen.getByText('No repository 428377c2.');
    expect(description.getAttribute('title')).toBe(`No repository ${ID}.`);
    const detail = screen.getByText('not_found · request 428377c2');
    expect(detail.getAttribute('title')).toBe(`not_found · request ${ID}`);
  });
});
