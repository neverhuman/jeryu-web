// familyScope.ts — the one spelling of "which family am I looking at?".
//
// The scope is a single family key, or '' for every family. It is stated in the
// URL, which is authoritative, in one of two forms:
//
//   * `?family=<key>` — Needs you, Work, In flight, Activity, Repositories.
//   * `<base>/family/<key>` — the release board (`/releases/family/<key>`) and
//     the family doorway (`/repos/family/<key>`), whose family is the page.
//
// One repository's own pages state their family by being that repository, so a
// scope is never written into their address: `/repos/<host>/<owner>/<name>`
// carries no `?family=`, and the rail inside it sets the scope instead.
//
// Everything here is pure, so it is unit-tested without a router. The React
// side (the provider, the tab's memory, the header chip) is FamilyScopeProvider.

/** The query parameter every page-level family filter reads. */
export const FAMILY_PARAM = 'family';

/** Where a tab remembers the scope it last chose (session, not durable). */
export const FAMILY_SCOPE_STORAGE_SLOT = 'jeryu.familyScope.v1';

/** Paths that hold the family as a path segment: `<base>/family/<key>`. */
const FAMILY_PATH_BASES = ['/releases', '/repos'] as const;

/** Bases whose bare path takes the path form when a scope is added to it. */
const FAMILY_PATH_DEFAULTS = new Set<string>(['/releases']);

/**
 * Parameters that make `/releases` a view of its own rather than the family
 * board. Those addresses state the family the way every other page states it,
 * so `?view=repositories&family=<key>` stays one address.
 */
const PATH_FORM_BLOCKERS = ['view', 'repo'] as const;

/**
 * One key per family: the repositories list says `acme-split`, the shift queue
 * and Needs you say `acme`, and a scope set on one page has to match rows on
 * the other. '' means every family.
 */
export function canonicalFamily(family: string | null | undefined): string {
  return (family ?? '').trim().replace(/-split$/, '');
}

/** True when `a` and `b` name the same family, whichever alias each uses. */
export function sameFamily(a: string | null | undefined, b: string | null | undefined): boolean {
  return canonicalFamily(a) === canonicalFamily(b);
}

/** `/repos/<host>/<owner>/<name>…`: the pages of one repository. */
const REPO_DETAIL_PATH = /^\/repos\/(?!family\/|new$)[^/]+\/[^/]+\/[^/]+/;

/**
 * True for an address that is one repository: it names its family by naming
 * the repository, so adding a scope to it would only clutter the URL.
 */
export function statesOwnFamily(pathname: string): boolean {
  return REPO_DETAIL_PATH.test(pathname);
}

/** A repository address with its legacy `?family=` removed, everything else kept. */
function dropFamilyParam(pathname: string, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  if (!params.has(FAMILY_PARAM)) {
    return `${pathname}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;
  }
  params.delete(FAMILY_PARAM);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

function splitHref(href: string): { pathname: string; search: string; hash: string } {
  const [beforeHash, ...hashParts] = href.split('#');
  const hash = hashParts.join('#');
  const [pathname, ...searchParts] = beforeHash.split('?');
  return { pathname, search: searchParts.join('?'), hash };
}

/** The family a `<base>/family/<key>` path names, or null for any other path. */
export function familyFromPath(pathname: string): string | null {
  for (const base of FAMILY_PATH_BASES) {
    const prefix = `${base}/family/`;
    if (!pathname.startsWith(prefix)) continue;
    const segment = pathname.slice(prefix.length).split('/')[0];
    if (segment) return decodeURIComponent(segment);
  }
  return null;
}

/**
 * The scope an address states, canonical, or null when it states none. An
 * empty `?family=` states none: a page clears the filter by dropping it.
 * A repository address names its family by naming the repository, so a legacy
 * `?family=` on it states nothing — otherwise that parameter cannot be cleared
 * and the header keeps saying the page is outside the scope.
 */
export function familyFromLocation(pathname: string, search: string): string | null {
  const fromPath = familyFromPath(pathname);
  if (fromPath) return canonicalFamily(fromPath);
  if (statesOwnFamily(pathname)) return null;
  const fromQuery = new URLSearchParams(search).get(FAMILY_PARAM);
  const canonical = canonicalFamily(fromQuery);
  return canonical ? canonical : null;
}

/** The scope a link states, canonical, or null when it states none. */
export function familyFromHref(href: string): string | null {
  const { pathname, search } = splitHref(href);
  return familyFromLocation(pathname, search);
}

/**
 * `href` carrying `family`, in whichever form that page uses, with every other
 * parameter and the hash kept. An empty `family` takes the scope back off.
 */
export function withFamilyScope(href: string, family: string): string {
  const { pathname, search, hash } = splitHref(href);
  // The repository is the scope. Do not add `?family=`, and drop a legacy one
  // so Clear and the rail can leave the address the reader can share.
  if (statesOwnFamily(pathname)) return dropFamilyParam(pathname, search, hash);
  const key = canonicalFamily(family);
  const params = new URLSearchParams(search);
  const pathBase = FAMILY_PATH_BASES.find((base) => pathname.startsWith(`${base}/family/`));
  const takesPathForm =
    FAMILY_PATH_DEFAULTS.has(pathname) && !PATH_FORM_BLOCKERS.some((name) => params.has(name));
  const base = pathBase ?? (takesPathForm ? pathname : null);
  let nextPath = pathname;
  if (base) {
    // The path form and the query form never both hold the family.
    params.delete(FAMILY_PARAM);
    nextPath = key ? `${base}/family/${encodeURIComponent(key)}` : base;
  } else if (key) {
    params.set(FAMILY_PARAM, key);
  } else {
    params.delete(FAMILY_PARAM);
  }
  const query = params.toString();
  return `${nextPath}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

/**
 * `href` carrying `family` unless it already names a family of its own: a link
 * to another family's item keeps that family, anything else keeps the scope.
 */
export function keepFamilyScope(href: string, family: string): string {
  return familyFromHref(href) === null ? withFamilyScope(href, family) : href;
}
