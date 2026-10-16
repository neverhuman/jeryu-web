// canonicalLinks.ts — the one place that says what a link to a repository or
// a pull request looks like outside this app.
//
// In-app navigation uses `repoUrl`/`pullBasePath` (`/repos/<provider>/…`),
// which the router resolves without a hop. A link that leaves the app — copied
// into a chat, a pull request body, an agent's output — is the forge's public
// shape instead, and for a repository this forge hosts that shape omits the
// provider:
//
//   * repository: `/<owner>/<repo>`
//   * pull request: `/<owner>/<repo>/pull/<number>[/<tab>]`
//
// A repository mirrored from another host keeps `/repos/<provider>/…`: two
// hosts can carry the same `owner/name`, and a short link between them would
// name a repository nobody asked for. `jeryu-api`'s `links` module is the same
// policy server-side, and where a payload returns `html_url` that value wins —
// the server knows its own public origin, this app only knows the one it was
// loaded from.

import type { PullTabKey } from './pullTabsModel';
import { repoUrl } from './repoBrowserModel';

/** Provider name of the repositories this forge hosts itself. */
export const NATIVE_PROVIDER = 'jeryu';

/** A repository as a link needs it. */
export interface CanonicalRepoRef {
  host: string;
  owner: string;
  name: string;
}

/** Whether `provider` names this forge's own hosting. */
export function isNativeProvider(provider: string): boolean {
  return provider.toLowerCase() === NATIVE_PROVIDER;
}

/**
 * The canonical browser path of a repository. The provider-qualified shape is
 * `repoUrl`'s, the one builder of that path.
 */
export function canonicalRepoPath(ref: CanonicalRepoRef): string {
  if (!isNativeProvider(ref.host)) return repoUrl(ref);
  return `/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;
}

/**
 * The canonical browser path of a pull request, with its tab when the link is
 * to one (`files`, `checks`, `commits`; Conversation is the bare path).
 */
export function canonicalPullPath(
  ref: CanonicalRepoRef,
  number: number | string,
  tab?: PullTabKey
): string {
  const suffix = tab && tab !== 'conversation' ? `/${tab}` : '';
  const pull = encodeURIComponent(String(number));
  if (isNativeProvider(ref.host)) {
    return `${canonicalRepoPath(ref)}/pull/${pull}${suffix}`;
  }
  return `${canonicalRepoPath(ref)}/pulls/${pull}${suffix}`;
}

/**
 * A rooted path as a URL to share: absolute against the origin this app was
 * loaded from. A value that is already absolute is returned unchanged, so a
 * server-returned `html_url` passes through with the origin the forge
 * publishes rather than the one the reader happens to be on.
 */
export function shareableUrl(pathOrUrl: string, origin?: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}${pathOrUrl}`;
}

/**
 * The link to share for an object: the `html_url` the forge returned when it
 * returned one, the locally built canonical path otherwise. Clients are told
 * to use the returned value; this keeps that true without going blank against
 * a forge that does not send it yet.
 */
export function sharedLink(htmlUrl: string | null | undefined, fallbackPath: string): string {
  const returned = htmlUrl?.trim();
  if (returned) return shareableUrl(returned);
  return shareableUrl(fallbackPath);
}
