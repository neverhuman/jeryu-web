// AdminWaitlistPanel.tsx — Settings > Waitlist, for an administrator: every
// address the public waitlist form stored, newest request first, one page at
// a time.
//
// Joining does not open an account, so these are addresses and what people
// typed, not users. A server from before the waitlist answers 404: the panel
// says so instead of showing an error.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import { ActionButton } from '../components/action/ActionButton';
import { ErrorState, LoadingState } from '../components/state';
import { formatCount } from '../format/number';
import { When } from '../format/When';

export const WAITLIST_PAGE_SIZE = 100;

export interface WaitlistSignup {
  email: string;
  name: string | null;
  note: string | null;
  status: 'listed' | 'invited' | 'declined' | string;
  source: string;
  request_count: number;
  created_at: string;
  last_requested_at: string;
}

export interface WaitlistPage {
  signups: WaitlistSignup[];
  limit: number;
  offset: number;
  total: number;
}

export function AdminWaitlistPanel(): JSX.Element {
  const [offset, setOffset] = useState(0);
  const page = useQuery({
    queryKey: ['admin', 'waitlist', offset],
    queryFn: ({ signal }) =>
      apiGet<WaitlistPage>(endpoints.adminWaitlist(WAITLIST_PAGE_SIZE, offset), { signal }),
  });
  const missing = page.error instanceof ApiError && page.error.status === 404;
  const total = page.data?.total ?? 0;
  const signups = page.data?.signups ?? [];
  const first = signups.length > 0 ? offset + 1 : 0;
  const last = offset + signups.length;

  return (
    <section className="page__section" aria-labelledby="admin-waitlist">
      <h2 className="page__section-title" id="admin-waitlist">
        Waitlist
      </h2>
      <p className="page__note">
        Addresses left on the public waitlist form, newest first. Joining does not open an account.
      </p>
      {page.isPending ? (
        <LoadingState title="Loading the waitlist..." variant="message" />
      ) : missing ? (
        <p className="page__note" data-testid="admin-waitlist-missing">
          This server does not keep a waitlist.
        </p>
      ) : page.error ? (
        <ErrorState title="Could not load the waitlist" error={page.error} />
      ) : total === 0 ? (
        <p className="page__note" data-testid="admin-waitlist-empty">
          Nobody has joined the waitlist yet.
        </p>
      ) : (
        <div className="page__card">
          <p className="page__note" data-testid="admin-waitlist-count">
            {total === signups.length && offset === 0
              ? `${formatCount(total)} ${total === 1 ? 'address' : 'addresses'}`
              : `${formatCount(first)}–${formatCount(last)} of ${formatCount(total)} addresses`}
          </p>
          <div className="table-scroll">
            <table className="admin-users__table" data-testid="admin-waitlist-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Name</th>
                  <th scope="col">What they want</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Requests</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((signup) => (
                  <tr key={signup.email}>
                    <th scope="row">
                      <a href={`mailto:${signup.email}`}>{signup.email}</a>
                    </th>
                    <td>{signup.name ?? '—'}</td>
                    <td>{signup.note ?? '—'}</td>
                    <td>
                      <When at={signup.created_at} label="Joined" />
                    </td>
                    <td>
                      {signup.request_count > 1 ? (
                        <>
                          {formatCount(signup.request_count)} (last{' '}
                          <When at={signup.last_requested_at} label="Last asked" />)
                        </>
                      ) : (
                        '1'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > WAITLIST_PAGE_SIZE ? (
            <div className="page__inline-actions">
              <ActionButton
                variant="default"
                disabled={offset === 0 || page.isFetching}
                onClick={() => setOffset(Math.max(0, offset - WAITLIST_PAGE_SIZE))}
              >
                Newer
              </ActionButton>
              <ActionButton
                variant="default"
                disabled={last >= total || page.isFetching}
                onClick={() => setOffset(offset + WAITLIST_PAGE_SIZE)}
              >
                Older
              </ActionButton>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
