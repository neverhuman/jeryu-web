// AdminUsersPanel.tsx — Settings > Users, for an administrator: every account,
// its role, its kind, its email address, and a password reset that mails the
// person a temporary password.
//
// A reset needs somewhere to send the password. An account with no address on
// file gets one here; an unverified address can be corrected before sending; a
// verified one is used read-only. The person signs in with the temporary
// password and has to choose their own before anything else.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type FormEvent } from 'react';

import { ApiError, apiGet, apiPut, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import { ActionButton } from '../components/action/ActionButton';
import { ErrorState, LoadingState } from '../components/state';
import { pillClass } from '../components/tone/tone';
import { RATE_LIMITED, UNREACHABLE } from './account/accountCopy';

type AccountKind = 'human' | 'service';

export interface AdminUser {
  login: string;
  role: 'admin' | 'user';
  /** A person, or automation (absent on older servers: read it to mean a person). */
  kind?: AccountKind;
  /** `set` by an admin, named in the instance `config`, or the `default`. */
  kind_source?: 'set' | 'config' | 'default';
  /** The address on file; absent on a server that predates account email. */
  email?: string | null;
  emailVerified?: boolean;
  created_at: string;
  updated_at: string;
}

/** What the forge answers once the temporary password is in the mail. */
export interface ResetReceipt {
  result: 'sent';
  login: string;
  email: string;
}

const USERS_KEY = ['admin', 'users'];

const KIND_LABEL: Record<AccountKind, string> = {
  human: 'Person',
  service: 'Automation',
};

/**
 * One account's kind, with its own pending state so changing one row never
 * freezes the others. A login the instance configuration names is automation
 * whatever is stored, so its kind is shown but not offered for change.
 */
function KindCell({ account }: { account: AdminUser }): JSX.Element {
  const queryClient = useQueryClient();
  const setKind = useMutation({
    mutationFn: (kind: AccountKind) =>
      apiPut<AdminUser>(endpoints.adminUserKind(account.login), { kind }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
  const pinned = account.kind_source === 'config';
  // A kind this page does not know is shown the way the server sent it, never
  // offered for change: a select without its value would overwrite it blind.
  if (account.kind !== undefined && !(account.kind in KIND_LABEL)) {
    return <span className="page__pill page__pill--muted">{String(account.kind)}</span>;
  }
  return (
    <>
      <select
        value={account.kind ?? 'human'}
        disabled={pinned || setKind.isPending}
        aria-label={`Kind of ${account.login}`}
        title={pinned ? 'Named as automation in the instance configuration' : undefined}
        onChange={(event) => setKind.mutate(event.target.value as AccountKind)}
      >
        {(Object.keys(KIND_LABEL) as AccountKind[]).map((kind) => (
          <option key={kind} value={kind}>
            {KIND_LABEL[kind]}
          </option>
        ))}
      </select>
      {pinned ? <span className="page__pill page__pill--muted">config</span> : null}
      {setKind.error ? (
        <span className="shift__error" role="alert">
          {setKind.error.message}
        </span>
      ) : null}
    </>
  );
}

function EmailCell({ account }: { account: AdminUser }): JSX.Element {
  if (!account.email) return <span className="text-muted">none</span>;
  return (
    <>
      <code>{account.email}</code>{' '}
      <span className={pillClass(account.emailVerified ? 'ok' : 'warn')}>
        {account.emailVerified ? 'verified' : 'unverified'}
      </span>
    </>
  );
}

/** A refused reset, in words that say what to do next. */
function resetProblem(error: Error): string {
  if (!(error instanceof ApiError)) return UNREACHABLE;
  if (error.status === 429) return RATE_LIMITED;
  switch (error.code) {
    case 'email_required':
      return 'This account has no email address. Enter the one the temporary password should go to.';
    case 'conflict':
      return 'That address cannot be used: another account has it, or this account already verified a different one.';
    case 'mail_unavailable':
      return 'This forge cannot send email yet. Set up outgoing mail, then try again.';
    case 'mail_failed':
      return 'The mail server did not accept the message. Try again in a moment.';
    default:
      return error.message;
  }
}

/** The inline form under one account's row: where the temporary password goes. */
function ResetPasswordForm({
  account,
  onSent,
  onCancel,
}: {
  account: AdminUser;
  onSent: (receipt: ResetReceipt) => void;
  onCancel: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const verified = Boolean(account.email) && account.emailVerified === true;
  const [email, setEmail] = useState(account.email ?? '');
  const reset = useMutation({
    mutationFn: (body: { email?: string }) =>
      apiSend<ResetReceipt>(endpoints.adminResetPassword(account.login), body),
    onSuccess: (receipt) => {
      onSent(receipt);
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // A verified address is the one on file; the server uses it unasked.
    reset.mutate(verified ? {} : { email: email.trim() });
  };
  const fieldId = `reset-email-${account.login}`;
  return (
    <form
      className="admin-users__reset"
      aria-label={`Reset the password of ${account.login}`}
      onSubmit={submit}
    >
      {verified ? (
        <p className="admin-users__reset-to">
          Sends to <code>{account.email}</code>{' '}
          <span className={pillClass('ok')}>verified</span>
        </p>
      ) : (
        <label className="admin-users__reset-field" htmlFor={fieldId}>
          <span>Where should the temporary password go?</span>
          <input
            id={fieldId}
            className="form-input"
            type="email"
            name="email"
            autoComplete="off"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
      )}
      <p className="page__note">They sign in with it and must choose a new password.</p>
      <div className="page__inline-actions">
        <ActionButton type="submit" variant="primary" disabled={reset.isPending}>
          {reset.isPending ? 'Sending…' : 'Email a temporary password'}
        </ActionButton>
        <ActionButton type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
      {reset.error ? (
        <p className="shift__error" role="alert">
          {resetProblem(reset.error)}
        </p>
      ) : null}
    </form>
  );
}

export function AdminUsersPanel(): JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const [sent, setSent] = useState<ResetReceipt | null>(null);
  const users = useQuery({
    queryKey: USERS_KEY,
    queryFn: ({ signal }) => apiGet<AdminUser[]>(endpoints.adminUsers(), { signal }),
  });
  const accounts = users.data ?? [];
  // A server that predates account kinds sends none: no column to change.
  const hasKinds = accounts.some((account) => account.kind !== undefined);
  // Nor does one that predates account email send addresses: no column to show.
  const hasEmails = accounts.some((account) => account.email !== undefined);
  const columns = 3 + (hasKinds ? 1 : 0) + (hasEmails ? 1 : 0);
  return (
    <section className="page__section" aria-labelledby="admin-users">
      <h2 className="page__section-title" id="admin-users">
        Users
      </h2>
      {users.isPending ? (
        <LoadingState title="Loading users..." variant="message" />
      ) : users.error ? (
        <ErrorState title="Could not load users" error={users.error} />
      ) : (
        <div className="page__card">
          <div className="table-scroll">
            <table className="admin-users__table" data-testid="admin-users-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  {hasKinds ? <th scope="col">Kind</th> : null}
                  {hasEmails ? <th scope="col">Email</th> : null}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <Fragment key={account.login}>
                    <tr>
                      <th scope="row">{account.login}</th>
                      <td>
                        <span className="page__pill">{account.role}</span>
                      </td>
                      {hasKinds ? (
                        <td>
                          <KindCell account={account} />
                        </td>
                      ) : null}
                      {hasEmails ? (
                        <td>
                          <EmailCell account={account} />
                        </td>
                      ) : null}
                      <td className="admin-users__actions">
                        <ActionButton
                          variant="default"
                          aria-expanded={open === account.login}
                          onClick={() => {
                            setSent(null);
                            setOpen(open === account.login ? null : account.login);
                          }}
                        >
                          Reset password
                        </ActionButton>
                      </td>
                    </tr>
                    {open === account.login ? (
                      <tr className="admin-users__detail">
                        <td colSpan={columns}>
                          <ResetPasswordForm
                            account={account}
                            onSent={(receipt) => {
                              setSent(receipt);
                              setOpen(null);
                            }}
                            onCancel={() => setOpen(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {sent?.login === account.login ? (
                      <tr className="admin-users__detail">
                        <td colSpan={columns}>
                          <p role="status" data-testid={`reset-sent-${account.login}`}>
                            Sent to <code>{sent.email}</code>. {sent.login} must choose a new
                            password at next sign-in.
                          </p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {hasKinds ? (
            <p className="page__roadmap-note">
              Only people can be assigned work. Mark service and automation logins as Automation
              so they stay out of the assign list; a login the instance configuration names is
              always automation.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
