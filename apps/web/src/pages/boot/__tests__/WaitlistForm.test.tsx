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
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'waitlist-status');
  });

  it('posts the form, clears it, and uses one receipt for a repeat', async () => {
    const user = userEvent.setup();
    send.mockResolvedValue({ result: 'received' });
    render(<WaitlistForm />);
    expect(screen.getByText(/send an invitation/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('What do you want from JeRyū?'), 'agents');
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent("Thanks, you're on the list.");
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('What do you want from JeRyū?')).toHaveValue('');
    expect(send).toHaveBeenCalledWith(endpoints.waitlistJoin(), {
      email: 'ada@example.com',
      name: 'Ada',
      note: 'agents',
    });
    expect(endpoints.waitlistJoin()).toBe('/api/v1/waitlist');
    expect(send).not.toHaveBeenCalledWith(endpoints.authLogin(), expect.anything());
    expect(send).not.toHaveBeenCalledWith(endpoints.authSignup(), expect.anything());

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent("Thanks, you're on the list.");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('renders 422, 429, and 500 differently', async () => {
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
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');

    send.mockRejectedValueOnce(new ApiError(429, { code: 'rate_limited', message: 'slow down' }));
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Too many attempts. Try again later.'
    );

    send.mockRejectedValueOnce(new ApiError(500, { code: 'storage_failed', message: 'disk full' }));
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The waitlist could not be reached. Try again.'
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('disk full');
  });
});
