// useSignupPolicy.ts — whether this forge lets anyone sign up, and where its
// waitlist is.
//
// `closed` is the default: nobody creates an account without an invitation,
// and the sign-up surfaces send people to the waitlist instead. `email` opens
// the email-first sign-up. A forge without the policy route (older servers
// answer 404) or with a mode this app does not know is closed: sign-up never
// opens by accident. A policy that could not be read (network, 5xx) is said
// so, with a retry, rather than shown to be invite-only.

import { useQuery } from '@tanstack/react-query';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';

export interface SignupPolicy {
  mode: 'closed' | 'email';
  /** An external waitlist the operator runs, or null for the forge's own form. */
  waitlistUrl: string | null;
}

/** An external waitlist, with the host named so the link can say where it goes. */
export interface ExternalWaitlist {
  href: string;
  host: string;
}

export type SignupPolicyView =
  | { state: 'loading' }
  | { state: 'known'; mode: SignupPolicy['mode']; waitlist: ExternalWaitlist | null }
  | { state: 'unreadable'; retrying: boolean; retry: () => void };

export const SIGNUP_POLICY_QUERY_KEY: readonly ['auth', 'signup-policy'] = [
  'auth',
  'signup-policy',
];

const CLOSED: SignupPolicy = { mode: 'closed', waitlistUrl: null };

/**
 * Only a plain web address leaves the site: http or https, with no user name
 * or password in it (`https://trusted@elsewhere/` names `elsewhere`, and the
 * link must not read like it goes to `trusted`). Anything else keeps the
 * forge's own form. The host shown is the one the browser will open.
 */
export function externalWaitlist(raw: string | null | undefined): ExternalWaitlist | null {
  const url = typeof raw === 'string' && URL.canParse(raw) ? new URL(raw) : undefined;
  const plainWeb =
    url !== undefined &&
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.username === '' &&
    url.password === '' &&
    url.host !== '';
  return plainWeb ? { href: url.href, host: url.host } : null;
}

/** A 404 is an older forge without the route; anything else is worth one more try. */
function retryPolicy(failures: number, error: Error): boolean {
  const absent = error instanceof ApiError && error.status === 404;
  return !absent && failures < 1;
}

export function useSignupPolicy(): SignupPolicyView {
  const policy = useQuery({
    queryKey: SIGNUP_POLICY_QUERY_KEY,
    queryFn: ({ signal }) => apiGet<SignupPolicy>(endpoints.authSignupPolicy(), { signal }),
    retry: retryPolicy,
    staleTime: 60_000,
  });
  if (policy.isPending) return { state: 'loading' };
  const route: 'served' | 'absent' | 'unreadable' = policy.isSuccess
    ? 'served'
    : policy.error instanceof ApiError && policy.error.status === 404
      ? 'absent'
      : 'unreadable';
  if (route === 'unreadable') {
    return {
      state: 'unreadable',
      retrying: policy.isFetching,
      retry: () => void policy.refetch(),
    };
  }
  // An older forge (404) has no policy to read: closed.
  const served: SignupPolicy = policy.isSuccess && policy.data ? policy.data : CLOSED;
  return {
    state: 'known',
    mode: served.mode === 'email' ? 'email' : 'closed',
    waitlist: externalWaitlist(served.waitlistUrl),
  };
}
