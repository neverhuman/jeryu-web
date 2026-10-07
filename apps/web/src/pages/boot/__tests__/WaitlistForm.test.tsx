import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../api/client')>(
    '../../../api/client'
  );
  return { ...actual, apiSend: vi.fn() };
});

import { ApiError, apiSend } from '../../../api/client';
import { endpoints } from '../../../api/endpoints';
import { WaitlistForm } from '../WaitlistForm';

const send = vi.mocked(apiSend);

describe('WaitlistForm', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('does not post an empty email', async () => {
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(send).not.toHaveBeenCalled();
    const form = screen.getByRole('button', { name: 'Join the waitlist' }).closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Enter an email address.');
  });

  it('posts email, name, and note and reports created or already listed', async () => {
    const user = userEvent.setup();
    send
      .mockResolvedValueOnce({
        result: 'created',
        email: 'ada@example.com',
        created_at: '2026-10-07T00:00:00Z',
        request_count: 1,
      })
      .mockResolvedValueOnce({
        result: 'already_listed',
        email: 'ada@example.com',
        created_at: '2026-10-07T00:00:00Z',
        request_count: 2,
      });
    render(<WaitlistForm />);
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('What do you want from JeRyu?'), 'agents');
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent("You're on the waitlist.");
    expect(send).toHaveBeenCalledWith(endpoints.waitlistJoin(), {
      email: 'ada@example.com',
      name: 'Ada',
      note: 'agents',
    });
    expect(endpoints.waitlistJoin()).toBe('/api/v1/waitlist');
    expect(send).not.toHaveBeenCalledWith(endpoints.authLogin(), expect.anything());
    expect(send).not.toHaveBeenCalledWith(endpoints.authSignup(), expect.anything());

    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'This email is already on the waitlist.'
    );
  });

  it('renders a validation failure and a network failure differently', async () => {
    const user = userEvent.setup();
    send.mockRejectedValueOnce(
      new ApiError(422, { code: 'invalid_email', message: 'bad email' })
    );
    render(<WaitlistForm />);
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'That email address cannot be saved.'
    );

    send.mockRejectedValueOnce(new TypeError('offline'));
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The waitlist could not be reached. Try again.'
    );
  });
});
