// repoBrowserModel.ts — pure helpers for the one repository page.
//
// The repository front page (`/repos/:p/:o/:r`) and the file page
// (`…/blob/<ref>/<path>`) are one layout: the Files panel fixed on the left,
// the content beside it; the panel stays put while you move between them.

import type { BreadcrumbSegment } from '../components/browser';
import { failingLabel } from './repoStatusModel';
import { formatCount } from '../format/number';

export { ancestorsOf } from '../components/browser/fileTreePaths';

/**
 * The repository sub-pages a link can address. `RepoRouter` dispatches on
 * exactly these segments, so a link that names one lands on that tab.
 */
export const REPO_TABS = [
  'agents',
  'blob',
  'code',
  'commit',
  'pulls',
  'settings',
  'tree',
] as const;

export type RepoTab = (typeof REPO_TABS)[number];

/** A repository as a link needs it: which forge, and which repository on it. */
export interface RepoRef {
  host: string;
  owner: string;
  name: string;
}

/** A ref from a host and `owner/name`, the shape most payloads carry. */
export function repoRefOf(host: string, fullName: string): RepoRef {
  const slash = fullName.indexOf('/');
  if (slash === -1) return { host, owner: '', name: fullName };
  return { host, owner: fullName.slice(0, slash), name: fullName.slice(slash + 1) };
}

/**
 * The one builder of in-app repository URLs:
 * `/repos/<host>/<owner>/<name>[/<tab>[/<tail>]]`.
 *
 * Nothing else spells that path: the forge a repository lives on comes from
 * the data, so a link never names one host while the repository is on another.
 * `tail` is appended as given — it may hold slashes (a ref and a file path)
 * and a `#` fragment, so its caller encodes its own segments. A ref with no
 * owner (a read model that names a repository bare) leaves out that segment
 * rather than leaving an empty one.
 */
export function repoUrl(ref: RepoRef, tab?: RepoTab, tail?: string): string {
  const segments = [ref.host, ref.owner, ref.name]
    .filter((segment) => segment !== '')
    .map(encodeURIComponent);
  const base = `/repos/${segments.join('/')}`;
  if (!tab) return base;
  return tail ? `${base}/${tab}/${tail}` : `${base}/${tab}`;
}

/** `/repos/<provider>/<owner>/<name>`: the repository's front page. */
export function repoFrontPath(provider: string, fullName: string): string {
  return repoUrl(repoRefOf(provider, fullName));
}

/** What the shell's trail needs to know about the repository, once it is read. */
export interface RepoTrailFacts {
  family?: string | null;
}

/**
 * The trail above every repository page, after its nav parent (Repositories):
 * the host, the family, the owner and the repository itself, then `tail` for a
 * page that sits below the repository outside its shell (a pull request, the
 * commit history, one commit). The host is often
 * named like the owner under it ("jeryu / … / jeryu"), so it says it is the
 * host. The family is often named like the owner ("veox-ai / veox-ai"): then
 * one crumb is both and opens the family; a different family says it is one.
 */
export function repoShellCrumbs(
  provider: string,
  fullName: string,
  facts: RepoTrailFacts | null,
  ...tail: BreadcrumbSegment[]
): BreadcrumbSegment[] {
  const slash = fullName.lastIndexOf('/');
  const owner = slash === -1 ? '' : fullName.slice(0, slash);
  const name = slash === -1 ? fullName : fullName.slice(slash + 1);
  const family = facts?.family ?? null;
  const familyPath = family ? `/repos/family/${encodeURIComponent(family)}` : null;
  return [
    { label: provider, prefix: 'host', to: `/repos?host=${encodeURIComponent(provider)}` },
    ...(family && familyPath && family !== owner
      ? [{ label: family, prefix: 'family', to: familyPath }]
      : []),
    family === owner && familyPath ? { label: owner, to: familyPath } : { label: owner },
    // The repository is the page itself unless something sits below it.
    tail.length > 0 ? { label: name, to: repoFrontPath(provider, fullName) } : { label: name },
    ...tail,
  ];
}

/** The page of one file at one ref. */
export function blobPath(provider: string, fullName: string, ref: string, path: string): string {
  return repoUrl(repoRefOf(provider, fullName), 'blob', `${encodeURIComponent(ref)}/${path}`);
}

/** The tree route of one folder at one ref; it opens that folder in the Files panel. */
export function treePath(provider: string, fullName: string, ref: string, dir: string): string {
  return repoUrl(repoRefOf(provider, fullName), 'tree', `${encodeURIComponent(ref)}/${dir}`);
}

/** Split a blob splat (`<ref>/<path…>`) into its ref and path. */
export function parseRefAndPath(splat: string): { ref: string; path: string } {
  if (!splat) return { ref: '', path: '' };
  const slash = splat.indexOf('/');
  if (slash === -1) return { ref: splat, path: '' };
  return { ref: splat.slice(0, slash), path: splat.slice(slash + 1) };
}

/** Navigation state for a `…/tree/<ref>/<dir>` link: that folder open in the panel. */
export function revealFolderState(dir: string): { reveal: string } {
  return { reveal: dir.replace(/\/+$/, '') };
}

/** The folder a navigation asked to reveal in the Files panel, if any. */
export function folderToReveal(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('reveal' in state)) return null;
  return typeof state.reveal === 'string' && state.reveal !== '' ? state.reveal : null;
}

/** "3 open pull requests", "1 open pull request", "No open pull requests". */
export function openPullsLabel(count: number): string {
  if (count <= 0) return 'No open pull requests';
  return `${count} open pull request${count === 1 ? '' : 's'}`;
}

/** "1 commit" / "1,204 commits" on the ref the page is showing. */
export function commitCountLabel(total: number): string {
  const safe = Math.max(0, Math.trunc(total));
  return `${formatCount(safe)} commit${safe === 1 ? '' : 's'}`;
}

/** "12 branches · 3 tags"; a kind with none of them is left out. */
export function refCountsLabel(refs: { kind: string }[]): string {
  const branches = refs.filter((ref) => ref.kind === 'branch').length;
  const tags = refs.filter((ref) => ref.kind === 'tag').length;
  return [
    branches > 0 ? `${branches} branch${branches === 1 ? '' : 'es'}` : '',
    tags > 0 ? `${tags} tag${tags === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * True when the header's health chip stands for failing checks, and so can say
 * so and open them. The server sets `health` to `warning` exactly when the
 * default branch has failing checks, so a chip with none behind it stays a
 * plain pill: there would be nothing to show.
 */
export function healthOpensChecks(repo: {
  health: string;
  failing_checks: number;
}): boolean {
  return repo.health !== 'healthy' && repo.failing_checks > 0;
}

/** "warning · 1 failing check": the chip says what set it. */
export function healthChipLabel(health: string, failingChecks: number): string {
  return `${health.replaceAll('_', ' ')} · ${failingLabel(failingChecks)}`;
}
