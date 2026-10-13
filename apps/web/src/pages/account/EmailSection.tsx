// EmailSection.tsx — Settings: the address this account recovers its password
// through. Setting it mails a verification link; until that link is followed
// the address is unproved and no reset link goes to it. A server without the
// account email routes (404) shows no section.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ApiError, apiGet, apiPut, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ActionButton } from '../../components/action/ActionButton';
import { pillClass } from '../../components/tone/tone';

export interface AccountEmail {
  address: string | null;
  verified: boolean;
}

const KEY = ['auth', 'email'];

export function EmailSection(): JSX.Element | null {
  const queryClient = useQueryClient();
  const email = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => apiGet<AccountEmail>(endpoints.authEmail(), { signal }),
    retry: false,
  });
  const [address, setAddress] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const claim = useMutation({
    mutationFn: (next: string) => apiPut<AccountEmail>(endpoints.authEmail(), { address: next }),
    onSuccess: (_answer, next) => {
      setSent(next);
      setAddress('');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  const resend = useMutation({
    mutationFn: () => apiSend<AccountEmail>(endpoints.authEmailVerifyResend(), {}),
    onSuccess: () => setSent(email.data?.address ?? null),
  });

  // An older forge has no account email routes: it answers 404, and there is
  // nothing to configure here.
  const routes: 'served' | 'absent' =
    email.error instanceof ApiError && email.error.status === 404 ? 'absent' : 'served';
  if (routes === 'absent') return null;
  const current = email.data;
  const failure = claim.error ?? resend.error;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    claim.mutate(address.trim());
  };
  return (
    <section className="page__section" aria-labelledby="email-section">
      <h2 className="page__section-title" id="email-section">
        Email
      </h2>
      <p className="page__muted">
        The address a password reset link goes to. It has to be verified first: setting it sends a
        link to it.
      </p>
      {current?.address ? (
        <p data-testid="account-email-current">
          <code>{current.address}</code>{' '}
          <span className={pillClass(current.verified ? 'ok' : 'warn')}>
            {current.verified ? 'verified' : 'not verified'}
          </span>
          {!current.verified ? (
            <>
              {' '}
              <ActionButton
                type="button"
                onClick={() => resend.mutate()}
                disabled={resend.isPending}
              >
                Resend verification email
              </ActionButton>
            </>
          ) : null}
        </p>
      ) : email.isSuccess ? (
        <p className="page__muted">No address yet: only an administrator can reset this account&apos;s password.</p>
      ) : null}
      <form className="page__inline-actions" onSubmit={submit}>
        <label>
          <span className="visually-hidden">Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder={current?.address ? 'Change to…' : 'you@example.com'}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        <ActionButton type="submit" variant="primary" disabled={claim.isPending}>
          {current?.address ? 'Change and verify' : 'Add and verify'}
        </ActionButton>
      </form>
      {sent ? (
        <p role="status">
          A verification link is on its way to <code>{sent}</code>. It works for one day.
        </p>
      ) : null}
      {failure ? (
        <p className="shift__error" role="alert">
          {failure instanceof ApiError && failure.status === 429
            ? 'Too many attempts. Try again later.'
            : failure instanceof ApiError
              ? failure.message
              : 'The address could not be saved.'}
        </p>
      ) : null}
    </section>
  );
}
