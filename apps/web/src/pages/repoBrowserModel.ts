// repoBrowserModel.ts — pure helpers for the one repository page.
//
// The repository front page (`/repos/:p/:o/:r`) and the file page
// (`…/blob/<ref>/<path>`) are one layout: content on the left, a Files panel on
// the right that stays put while you move between them.

import { failingLabel } from './repoStatusModel';

export { ancestorsOf } from '../components/browser/fileTreePaths';

/** Where the Files panel choice is remembered (storage adapter, durable). */
export const FILES_PANEL_KEY = 'jeryu.repoFilesPanel.v1';

/** Below this width the panel starts closed: it would crowd the content. */
export const FILES_PANEL_MIN_WIDTH = 1100;

/** `/repos/<provider>/<owner>/<name>`: the repository's front page. */
export function repoFrontPath(provider: string, fullName: string): string {
  return `/repos/${encodeURIComponent(provider)}/${fullName}`;
}

/** The page of one file at one ref. */
export function blobPath(provider: string, fullName: string, ref: string, path: string): string {
  return `${repoFrontPath(provider, fullName)}/blob/${encodeURIComponent(ref)}/${path}`;
}

/** Split a blob splat (`<ref>/<path…>`) into its ref and path. */
export function parseRefAndPath(splat: string): { ref: string; path: string } {
  if (!splat) return { ref: '', path: '' };
  const slash = splat.indexOf('/');
  if (slash === -1) return { ref: splat, path: '' };
  return { ref: splat.slice(0, slash), path: splat.slice(slash + 1) };
}

/** The remembered panel choice: `true` open, `false` closed, `null` never chosen. */
export function parsePanelChoice(stored: string | null): boolean | null {
  if (stored === 'open') return true;
  if (stored === 'closed') return false;
  return null;
}

export function panelChoiceText(open: boolean): string {
  return open ? 'open' : 'closed';
}

/** Open or closed when the page loads: the remembered choice, else by width. */
export function initialPanelOpen(stored: string | null, width: number): boolean {
  return parsePanelChoice(stored) ?? width >= FILES_PANEL_MIN_WIDTH;
}

/** `/code` redirects here with this navigation state so the panel opens. */
export const OPEN_FILES_STATE = { files: 'open' };

/** True when a navigation asked for the Files panel to be open. */
export function asksForFilesOpen(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'files' in state && state.files === 'open';
}

/** Navigation state for a `…/tree/<ref>/<dir>` link: Files open, that folder open. */
export function revealFolderState(dir: string): { files: string; reveal: string } {
  return { files: 'open', reveal: dir.replace(/\/+$/, '') };
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
  return `${safe.toLocaleString('en-US')} commit${safe === 1 ? '' : 's'}`;
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
