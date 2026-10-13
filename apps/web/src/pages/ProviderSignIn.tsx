// ProviderSignIn.tsx — Settings: sign a subscription in once, at the provider.
//
// The server opens a device sign-in with the provider. This shows the code and
// the page to enter it on, then reads the sign-in at the provider's interval
// until it ends. No secret passes through the browser: the refresh token goes
// from the provider to the server's vault.
//
// Only the server's answers move a sign-in here. Once one has ended it stays
// ended. Once the server has said it no longer has one, it is shown as gone,
// its code withdrawn, and no later pending answer reopens it (one saying it
// ended is still shown); only Sign in opens another. This browser's clock only
// words the deadline: it never ends, cancels or reopens a sign-in.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { ApiError, apiDeleteReceipt, apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  AgentProvider,
  ProviderLogin,
  ProviderLoginRequest,
} from '../api/types/providerConnections';
import { ActionButton } from '../components/action/ActionButton';
import { ErrorState } from '../components/state';
import {
  absoluteText,
  clockText,
  dateText,
  instantOf,
  isSameLocalDay,
  relativeText,
  rfc3339Seconds,
  zoneLabel,
} from '../format/when';
import { PROVIDERS, providerLabel } from './providerNames';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function loginKey(id: string): string[] {
  return ['me', 'provider-login', id];
}

/** A page the provider named, as a link only when it is an http(s) URL. */
function linkTo(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function ProviderPage({ uri }: { uri: string | undefined }): JSX.Element {
  const href = linkTo(uri);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {uri}
    </a>
  ) : (
    <span>{uri ?? 'the provider'}</span>
  );
}

/**
 * Whether the server answered that it has no such sign-in. It keeps them in
 * memory, so a restart forgets the open ones, and it forgets an ended one ten
 * minutes on. Any other failure (no network, a 5xx) says nothing about the
 * sign-in, which stays as last read.
 */
function isMissing(error: unknown): boolean {
  if (!error) return false;
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    error.code === 'provider_login_not_found'
  );
}

/**
 * The sign-in as known once `seen` arrives. An ended one stays ended: a read
 * sent before it ended can still answer pending after the end is known.
 */
function latest(known: ProviderLogin | undefined, seen: ProviderLogin): ProviderLogin {
  return known?.login_id === seen.login_id && known.state !== 'pending' && seen.state === 'pending'
    ? known
    : seen;
}

/**
 * The code's deadline as the server set it: the clock time with the zone it
 * falls in, which a clock change can make differ from the zone now (and the
 * date when that is not today), then how long that leaves while it is between
 * a minute and an hour away. `now` is this browser's clock, which may be off,
 * so the duration is only a hint and is left out when it is not plausible.
 */
function deadlineText(expiresAt: string, now: number): string {
  const at = instantOf(expiresAt);
  if (at === null) return expiresAt;
  const clock = `${clockText(at).slice(0, 5)} ${zoneLabel(at)}`;
  const when = isSameLocalDay(at, now) ? clock : `${dateText(at)}, ${clock}`;
  const left = at - now;
  return left >= MINUTE && left <= HOUR ? `${when} (${relativeText(at, now)})` : when;
}

export function ProviderSignIn({
  onConnected,
}: {
  /** Called once when a sign-in ends connected, to refresh the list. */
  onConnected: () => Promise<void>;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AgentProvider>('claude');
  const [account, setAccount] = useState('');
  // The sign-in this form follows; what is known of it is its query's data.
  const [id, setId] = useState('');
  // The sign-ins the server answered, to a read or to a cancel, that it no
  // longer has. That is kept here, per sign-in, rather than only as the read's
  // error, which any later answer clears: a pending answer after it (from a
  // cancel sent before it, say) must not reopen the sign-in.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const markGone = (error: unknown, loginId: string): void => {
    if (isMissing(error)) {
      setGone((known) => (known.has(loginId) ? known : new Set(known).add(loginId)));
    }
  };
  const start = useMutation({
    mutationFn: (request: ProviderLoginRequest) =>
      apiSend<ProviderLogin>(endpoints.providerLogins(), request),
    onSuccess: (opened) => {
      queryClient.setQueryData(loginKey(opened.login_id), opened);
      setId(opened.login_id);
    },
  });
  // A sign-in is read while it is pending and the server still has it: never
  // before one is opened, nor after it has ended or gone. The read's own error
  // is checked too, because the query sees it before `gone` holds it.
  const following = (seen: ProviderLogin | undefined, error: unknown): boolean =>
    seen?.state === 'pending' && !gone.has(seen.login_id) && !isMissing(error);
  const status = useQuery({
    queryKey: loginKey(id),
    queryFn: async ({ signal }) => {
      try {
        const read = await apiGet<ProviderLogin>(endpoints.providerLogin(id), { signal });
        return latest(queryClient.getQueryData<ProviderLogin>(loginKey(id)), read);
      } catch (error) {
        markGone(error, id);
        throw error;
      }
    },
    enabled: (query) => following(query.state.data, query.state.error),
    // The next interval reads again after any other failure; a sign-in the
    // server says it no longer has is not asked about again at all.
    retry: false,
    // The server asks the provider at most once an interval; reading at it
    // is enough, and a slow_down lengthens it.
    refetchInterval: (query) => {
      const seen = query.state.data;
      return seen && following(seen, query.state.error)
        ? Math.max(1, seen.interval) * 1000
        : false;
    },
  });
  const cancel = useMutation({
    mutationFn: (loginId: string) =>
      apiDeleteReceipt<ProviderLogin>(endpoints.providerLogin(loginId)),
    // The receipt is the sign-in as the cancel left it: cancelled, or still
    // pending when the server was completing it, which is then read on (unless
    // the server has since said it no longer has it).
    onSuccess: (answer, loginId) => {
      queryClient.setQueryData<ProviderLogin>(loginKey(loginId), (known) =>
        latest(known, answer)
      );
    },
    onError: (error, loginId) => markGone(error, loginId),
  });
  const view = status.data;
  const open = following(view, status.error);
  // This browser's time at the server's last answer: it words the deadline
  // and moves with each read.
  const now = Math.max(status.dataUpdatedAt, status.errorUpdatedAt);
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (view?.state === 'connected' && reported.current !== view.login_id) {
      reported.current = view.login_id;
      void onConnected();
    }
  }, [view, onConnected]);
  const ready = account.trim() !== '' && !start.isPending && !open;

  return (
    <form
      className="page__card"
      aria-label="Sign in with a subscription"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        start.mutate({ provider, provider_account: account.trim() });
      }}
    >
      <p className="page__subtitle">
        Sign a subscription in at the provider. No secret is pasted, and none passes through this
        browser: the provider hands the sign-in to the server&apos;s vault.
      </p>
      <div className="page__inline-actions">
        <label className="admin-wiki__field">
          Provider
          <select
            value={provider}
            onChange={(event) => {
              const chosen = PROVIDERS.find((entry) => entry.value === event.currentTarget.value);
              if (chosen) setProvider(chosen.value);
            }}
          >
            {PROVIDERS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-wiki__field">
          Account label
          <input
            value={account}
            placeholder="max-plan"
            maxLength={128}
            onChange={(event) => setAccount(event.currentTarget.value)}
          />
        </label>
        <ActionButton type="submit" actionId="providers.sign_in" variant="primary" disabled={!ready}>
          Sign in
        </ActionButton>
      </div>
      {view && open ? (
        <div className="page__roadmap-note" role="status" data-testid="provider-sign-in-pending">
          <p>
            Open <ProviderPage uri={view.verification_uri} /> and enter{' '}
            <code data-testid="provider-sign-in-code">{view.user_code}</code> before{' '}
            <time
              dateTime={rfc3339Seconds(view.expires_at) ?? undefined}
              title={absoluteText(view.expires_at)}
            >
              {deadlineText(view.expires_at, now)}
            </time>
            .
            {linkTo(view.verification_uri_complete) ? (
              <>
                {' '}
                Or{' '}
                <a
                  href={linkTo(view.verification_uri_complete) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  open the page with the code filled in
                </a>
                .
              </>
            ) : null}
          </p>
          <ActionButton
            variant="default"
            // Only this sign-in's own cancel holds the button: one still on
            // its way for an earlier sign-in does not.
            disabled={cancel.isPending && cancel.variables === view.login_id}
            onClick={() => cancel.mutate(view.login_id)}
          >
            Cancel sign-in
          </ActionButton>
        </div>
      ) : view?.state === 'pending' ? (
        // Pending when last read, but the server no longer has it: how it
        // ended is not known here, so nothing is claimed about it.
        <p className="page__roadmap-note" role="status" data-testid="provider-sign-in-gone">
          The server no longer has the {providerLabel(view.provider)} sign-in for{' '}
          {view.provider_account}: it may have restarted, or the sign-in ended a while ago. The
          code shown for it no longer counts; sign in again to start a new one.
        </p>
      ) : view?.state === 'connected' ? (
        <span className="page__pill page__pill--success" role="status">
          Signed in {providerLabel(view.provider)} as {view.provider_account}
        </span>
      ) : view ? (
        <p className="page__roadmap-note" role="status">
          The sign-in ended {view.state}
          {view.reason ? `: ${view.reason}` : ''}. Sign in again to retry.
        </p>
      ) : null}
      {start.error ? <ErrorState title="Could not open the sign-in" error={start.error} /> : null}
      {/* A failed read or cancel matters only while the sign-in is open. */}
      {open && status.error ? (
        <ErrorState title="Could not read the sign-in" error={status.error} />
      ) : null}
      {open && cancel.error && cancel.variables === id ? (
        <ErrorState title="Could not cancel the sign-in" error={cancel.error} />
      ) : null}
    </form>
  );
}
