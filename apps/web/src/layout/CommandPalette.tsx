// CommandPalette.tsx — the one search-or-jump control (W-FE-14).
//
// Four groups: Go to (pages), Repositories (by `owner/name`), Pull request
// (typed as `owner/name#12` or `name#12`) and Theme. The repository list is
// loaded the first time the palette opens, not with the shell. Focus returns
// to whatever opened the palette when it closes.

import { Command } from 'cmdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useRepositories } from '../hooks/useRepositories';
import { useCommandStore } from '../stores/commandStore';
import { pullTargets, repositoryTargets, type PaletteTarget } from './paletteModel';

const NO_REPOS: never[] = [];

export function CommandPalette(): JSX.Element {
  const isOpen = useCommandStore((s) => s.isOpen);
  const close = useCommandStore((s) => s.close);
  const query = useCommandStore((s) => s.query);
  const setQuery = useCommandStore((s) => s.setQuery);
  const commands = useCommandStore((s) => s.commands);
  const execute = useCommandStore((s) => s.execute);
  const navigate = useNavigate();

  // Lazy: nothing is fetched until the palette has been opened once.
  const [everOpened, setEverOpened] = useState(false);
  // Who opened the palette. The store changes before React renders (and before
  // the input's autoFocus moves focus), so that is the moment to look.
  const opener = useRef<Element | null>(null);
  useEffect(
    () =>
      useCommandStore.subscribe((state, previous) => {
        if (state.isOpen && !previous.isOpen) opener.current = document.activeElement;
      }),
    []
  );
  useEffect(() => {
    if (!isOpen) return () => {};
    setEverOpened(true);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Closing hands focus back to the control that opened the palette.
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
      opener.current = null;
    };
  }, [isOpen, close]);

  const repos = useRepositories({ sort: 'name' }, { enabled: everOpened });
  const rows = repos.data?.repositories ?? NO_REPOS;
  const repoItems = useMemo(() => repositoryTargets(rows), [rows]);
  const pullItems = useMemo(() => pullTargets(query, rows), [query, rows]);
  const typed = query.trim() !== '';

  const pages = useMemo(() => commands.filter((c) => c.target.kind === 'route'), [commands]);
  const themes = useMemo(() => commands.filter((c) => c.target.kind !== 'route'), [commands]);

  if (!isOpen) return <></>;

  const jump = (target: PaletteTarget): void => {
    close();
    navigate(target.path);
  };

  return (
    <div
      className="command-palette__backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <Command className="command-palette__panel" label="Command palette" loop>
        <Command.Input
          className="command-palette__input"
          aria-label="Command search"
          placeholder="A page, a repository, or name#12 for a pull request"
          value={query}
          onValueChange={setQuery}
          autoFocus
        />
        <Command.List className="command-palette__list">
          <Command.Empty className="command-palette__empty">No matches found.</Command.Empty>
          {pullItems.length > 0 ? (
            <Command.Group heading={<span className="command-palette__group">Pull request</span>}>
              {pullItems.map((target) => (
                <Command.Item
                  key={target.id}
                  // The typed text is part of the value, so the item always matches it.
                  value={`${query} ${target.label}`}
                  className="command-palette__item"
                  onSelect={() => jump(target)}
                >
                  <span>{target.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          <Command.Group heading={<span className="command-palette__group">Go to</span>}>
            {pages.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={`${cmd.title} ${cmd.keywords.join(' ')}`}
                className="command-palette__item"
                onSelect={() => execute(cmd.id, (path) => navigate(path))}
              >
                <span>{cmd.title}</span>
                {cmd.shortcut ? (
                  <span className="command-palette__hint" aria-hidden="true">
                    {cmd.shortcut}
                  </span>
                ) : null}
              </Command.Item>
            ))}
          </Command.Group>
          {/* A hundred repositories are a wall; they appear once something is typed. */}
          {typed && repoItems.length > 0 ? (
            <Command.Group heading={<span className="command-palette__group">Repositories</span>}>
              {repoItems.map((target) => (
                <Command.Item
                  key={target.id}
                  value={target.label}
                  className="command-palette__item"
                  onSelect={() => jump(target)}
                >
                  <span>{target.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          <Command.Group heading={<span className="command-palette__group">Theme</span>}>
            {themes.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={`${cmd.title} ${cmd.keywords.join(' ')}`}
                className="command-palette__item"
                onSelect={() => execute(cmd.id, (path) => navigate(path))}
              >
                <span>{cmd.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
