// RepoSwitcher.tsx — where you are, and the way to another repository (W-FE-01).
//
// Inside a repository the chip names it (`owner/name`, never an internal id)
// and opens a typeahead over every repository the viewer can read: type part
// of a name, press Enter, and you are on its front page. The repositories of
// the family the shell is scoped to come first, because a switch is almost
// always within one family. Outside a repository the chip renders nothing: the
// left nav already has Repositories.
//
// The list is fetched the first time the chip is opened, not with the shell.

import { Command } from 'cmdk';
import { FolderGit2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { sameFamily } from '../components/family/familyScope';
import { useFamilyScope } from '../components/family/FamilyScopeProvider';
import { useRepositories } from '../hooks/useRepositories';
import { repoUrl } from '../pages/repoBrowserModel';
import { paletteScore } from './paletteModel';

const REPO_PATH = /^\/repos\/(?!family\/|new$)([^/]+)\/([^/]+)\/([^/]+)/;

const NO_REPOS: never[] = [];

/** `owner/name` of the repository a path is inside, or null. */
export function repoNameFromPath(pathname: string): string | null {
  const match = REPO_PATH.exec(pathname);
  if (!match) return null;
  try {
    return `${decodeURIComponent(match[2])}/${decodeURIComponent(match[3])}`;
  } catch {
    return `${match[2]}/${match[3]}`;
  }
}

/** The front page of the repository a path is inside, or null. */
export function repoHomeFromPath(pathname: string): string | null {
  const match = REPO_PATH.exec(pathname);
  if (!match) return null;
  // The segments come from a URL: decode them so the builder's own encoding
  // does not double up.
  return repoUrl({
    host: decodeSegment(match[1]),
    owner: decodeSegment(match[2]),
    name: decodeSegment(match[3]),
  });
}

function decodeSegment(segment: string | undefined): string {
  try {
    return decodeURIComponent(segment ?? '');
  } catch {
    return segment ?? '';
  }
}

/** One row of the switcher: what it says, where it goes, whose family it is in. */
export interface SwitchTarget {
  id: string;
  label: string;
  path: string;
  family: string | null;
}

interface RepoRow {
  id: { host: string; owner: string; name: string };
  family?: string | null;
}

/**
 * Every repository as a switch target: `family`'s own first, each block sorted
 * by name, so the repositories beside the one you are in are at the top. The
 * repository you are in is left out — the chip beside the list already names
 * it, and switching to it is not a switch.
 */
export function switchTargets(
  rows: readonly RepoRow[],
  family: string,
  current: string | null
): SwitchTarget[] {
  return rows
    .map((row) => ({
      id: `${row.id.host}:${row.id.owner}/${row.id.name}`,
      label: `${row.id.owner}/${row.id.name}`,
      path: repoUrl(row.id),
      family: row.family ?? null,
    }))
    .filter((target) => target.label !== current)
    .sort((a, b) => {
      const mine = (target: SwitchTarget): number =>
        family !== '' && sameFamily(target.family, family) ? 0 : 1;
      return mine(a) - mine(b) || a.label.localeCompare(b.label);
    });
}

export function RepoSwitcher(): JSX.Element | null {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scope = useFamilyScope();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const current = repoNameFromPath(pathname);

  // Nothing is fetched until the chip has been opened once.
  const repos = useRepositories({ sort: 'name' }, { enabled: open });
  const rows = (repos.data?.repositories ?? NO_REPOS) as readonly RepoRow[];
  // The family in scope, or — when the shell shows every family — the family
  // of the repository you are in: either way, its neighbours come first.
  const family =
    scope.carried ||
    rows.find((row) => `${row.id.owner}/${row.id.name}` === current)?.family ||
    '';
  const targets = useMemo(() => switchTargets(rows, family, current), [rows, family, current]);

  // Arriving somewhere else is the switch having worked: get out of the way.
  useEffect(() => {
    setOpen(false);
    setQuery('');
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!current) return null;

  const dismiss = (): void => {
    setOpen(false);
    setQuery('');
    button.current?.focus();
  };

  return (
    <div className="repo-switcher" data-testid="repo-switcher">
      <button
        type="button"
        ref={button}
        className={`repo-switcher__chip${open ? ' is-open' : ''}`}
        data-testid="repo-switcher-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${current}: switch repository`}
        title={`${current}: switch repository`}
        onClick={() => setOpen((was) => !was)}
      >
        <FolderGit2 size={14} aria-hidden="true" />
        <span className="repo-switcher__label">{current}</span>
      </button>
      {open ? (
        <div className="repo-switcher__panel" ref={panel}>
          <Command
            label="Switch repository"
            filter={paletteScore}
            loop
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();
              }
            }}
          >
            <Command.Input
              className="form-input repo-switcher__input"
              data-testid="repo-switcher-input"
              aria-label="Switch repository"
              placeholder="Part of a repository's name"
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
            <Command.List className="repo-switcher__list">
              {repos.isPending ? (
                <div className="repo-switcher__note">Loading repositories…</div>
              ) : repos.isError ? (
                <div className="repo-switcher__note">Could not load repositories.</div>
              ) : (
                <>
                  <Command.Empty className="repo-switcher__note">
                    No repository matches.
                  </Command.Empty>
                  {targets.map((target) => (
                    <Command.Item
                      key={target.id}
                      value={target.label}
                      className="repo-switcher__item"
                      onSelect={() => navigate(target.path)}
                    >
                      <span>{target.label}</span>
                      {target.family ? (
                        <span className="repo-switcher__family">{target.family}</span>
                      ) : null}
                    </Command.Item>
                  ))}
                </>
              )}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
