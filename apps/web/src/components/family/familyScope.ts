// familyScope.ts — the one spelling of "which family am I looking at?".
//
// The scope is a single family key, or '' for every family. It is stated in the
// URL, which is authoritative, in one of two forms:
//
//   * `?family=<key>` — Needs you, Work, In flight, Activity, Repositories.
//   * `<base>/family/<key>` — the release board (`/releases/family/<key>`) and
//     the split-family browser (`/repos/family/<key>`), whose family is the page.
//
// Everything here is pure, so it is unit-tested without a router. The React
// side (the provider, the tab's memory, the header chip) is FamilyScopeProvider.

/** The query parameter every page-level family filter reads. */
export const FAMILY_PARAM = 'family';

/** Where a tab remembers the scope it last chose (session, not durable). */
export const FAMILY_SCOPE_STORAGE_KEY = 'jeryu.familyScope.v1';

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
 */
export function familyFromLocation(pathname: string, search: string): string | null {
  const fromPath = familyFromPath(pathname);
  if (fromPath) return canonicalFamily(fromPath);
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
