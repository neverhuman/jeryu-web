// useSignupPolicy.ts — whether this forge lets anyone sign up, and where its
// waitlist is.
//
// `closed` is the default: nobody creates an account without an invitation,
// and the sign-up surfaces send people to the waitlist instead. `email` opens
// the email-first sign-up. A forge without the policy route (older servers
// answer 404), or one that cannot be read, is closed: sign-up never opens by
// accident.

import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';
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
  | { state: 'known'; mode: SignupPolicy['mode']; waitlist: ExternalWaitlist | null };

export const SIGNUP_POLICY_QUERY_KEY: readonly ['auth', 'signup-policy'] = [
  'auth',
  'signup-policy',
];

const CLOSED: SignupPolicy = { mode: 'closed', waitlistUrl: null };

/** Only a web address leaves the site; anything else keeps the forge's own form. */
export function externalWaitlist(raw: string | null | undefined): ExternalWaitlist | null {
  if (typeof raw !== 'string') return null;
  const scheme = raw.startsWith('https://') ? 'https://' : raw.startsWith('http://') ? 'http://' : '';
  const host = scheme ? raw.slice(scheme.length).split(/[/?#]/)[0] : '';
  return host ? { href: raw, host } : null;
}

export function useSignupPolicy(): SignupPolicyView {
  const policy = useQuery({
    queryKey: SIGNUP_POLICY_QUERY_KEY,
    queryFn: ({ signal }) => apiGet<SignupPolicy>(endpoints.authSignupPolicy(), { signal }),
    retry: false,
    staleTime: 60_000,
  });
  if (policy.isPending) return { state: 'loading' };
  const served = policy.data ?? CLOSED;
  return {
    state: 'known',
    mode: served.mode === 'email' ? 'email' : 'closed',
    waitlist: externalWaitlist(served.waitlistUrl),
  };
}
