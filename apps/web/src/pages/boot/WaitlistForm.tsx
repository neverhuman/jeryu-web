// WaitlistForm.tsx — public waitlist on the signed-out story.
//
// Joining stores an email, an optional name, and an optional note. It does
// not create an account, call signup, or keep the address in the browser
// after a receipt. New and repeat addresses share one message.

import { useState, type FormEvent } from 'react';

import { ApiError, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';

type Phase = 'idle' | 'submitting' | 'received' | 'invalid' | 'limited' | 'failed';

const RECEIVED = "Thanks, you're on the list.";
const LIMITED = 'Too many attempts. Try again later.';
const FAILED = 'The waitlist could not be reached. Try again.';

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function statusText(phase: Phase, detail: string): string | null {
  if (phase === 'received') return RECEIVED;
  if (phase === 'limited') return LIMITED;
  if (phase === 'invalid') return detail || 'Enter an email address.';
  if (phase === 'failed') return FAILED;
  return null;
}

export function WaitlistForm(): JSX.Element {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0) {
      setDetail('Enter an email address.');
      setPhase('invalid');
      return;
    }
    setPhase('submitting');
    setDetail('');
    try {
      const body = {
        email: trimmedEmail,
        name: optionalText(name),
        note: optionalText(note),
      };
      await apiSend(endpoints.waitlistJoin(), body);
      setEmail('');
      setName('');
      setNote('');
      setPhase('received');
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setDetail('That email address cannot be saved.');
        setPhase('invalid');
        return;
      }
      if (error instanceof ApiError && error.status === 429) {
        setPhase('limited');
        return;
      }
      setPhase('failed');
    }
  };

  const message = statusText(phase, detail);
  const emailInvalid = phase === 'invalid' || phase === 'limited' || phase === 'failed';

  return (
    <form className="waitlist" onSubmit={(event) => void submit(event)}>
      <p className="waitlist__title">Join the waitlist</p>
      <label className="waitlist__field">
        Email
        <input
          id="waitlist-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          aria-invalid={emailInvalid || undefined}
          aria-describedby={message ? 'waitlist-status' : undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="waitlist__field">
        Name
        <input
          type="text"
          name="name"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="waitlist__field">
        What do you want from JeRyu?
        <textarea
          name="note"
          maxLength={280}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button type="submit" className="waitlist__submit" disabled={phase === 'submitting'}>
        {phase === 'submitting' ? 'Joining…' : 'Join the waitlist'}
      </button>
      {message ? (
        <p className="waitlist__status" id="waitlist-status" role="status">
          {message}
        </p>
      ) : null}
      <p className="waitlist__privacy">
        We store this address to send an invitation. We do not open an account.
      </p>
    </form>
  );
}
