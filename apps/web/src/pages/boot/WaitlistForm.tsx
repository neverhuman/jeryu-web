// WaitlistForm.tsx — public waitlist on the signed-out story.
//
// Joining stores an email, an optional name, and an optional note. It does
// not create an account, call signup, or keep the address in the browser
// when the request fails.

import { useState, type FormEvent } from 'react';

import { ApiError, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';

type Phase = 'idle' | 'submitting' | 'created' | 'already_listed' | 'invalid' | 'failed';

interface WaitlistJoinResponse {
  result: 'created' | 'already_listed';
  email: string;
  created_at: string;
  request_count: number;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function statusText(phase: Phase, detail: string): string | null {
  if (phase === 'created') return "You're on the waitlist.";
  if (phase === 'already_listed') return 'This email is already on the waitlist.';
  if (phase === 'invalid') return detail || 'Enter an email address.';
  if (phase === 'failed') return 'The waitlist could not be reached. Try again.';
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
      const saved = await apiSend<WaitlistJoinResponse>(endpoints.waitlistJoin(), body);
      setPhase(saved.result === 'already_listed' ? 'already_listed' : 'created');
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setDetail('That email address cannot be saved.');
        setPhase('invalid');
        return;
      }
      setPhase('failed');
    }
  };

  const message = statusText(phase, detail);

  return (
    <form className="waitlist" onSubmit={(event) => void submit(event)}>
      <p className="waitlist__title">Join the waitlist</p>
      <label className="waitlist__field">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
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
        <p className="waitlist__status" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
