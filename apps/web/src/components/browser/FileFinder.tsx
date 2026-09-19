// FileFinder.tsx — fuzzy file finder (`t`), shared by the repository front
// page and the file page (W-FE-10).

import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';

import { useRepoTree } from '../../hooks/useRepoTree';
import type { TreeEntry } from '../../api/types';

import './browser.css';

export interface FileFinderProps {
  open: boolean;
  onClose: () => void;
  repoId: string | null;
  refName: string;
  onPick: (entry: TreeEntry) => void;
}

export function FileFinder({
  open,
  onClose,
  repoId,
  refName,
  onPick,
}: FileFinderProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  // The finder enumerates the root tree listing and fuzzy-filters it. The
  // backend serves a single-level tree per request, so the cmdk panel
  // filters against the entries returned for the current path.
  const tree = useRepoTree(repoId, refName, '');

  useEffect(() => {
    if (!open) return () => {};
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const items = useMemo<TreeEntry[]>(
    () => (tree.data ?? []).filter((entry) => entry.kind === 'file'),
    [tree.data]
  );

  if (!open) return <></>;

  return (
    <div
      className="file-finder__backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Command className="file-finder__panel" label="Find files" loop>
        <Command.Input
          className="file-finder__input"
          aria-label="Filter files"
          value={query}
          onValueChange={setQuery}
          autoFocus
        />
        <Command.List className="file-finder__list">
          {tree.isPending ? (
            <div className="file-tree__loading">Loading files…</div>
          ) : tree.isError ? (
            <div className="file-tree__error">
              Could not load files.
            </div>
          ) : items.length === 0 ? (
            <Command.Empty className="branch-selector__empty">
              No files at this ref.
            </Command.Empty>
          ) : (
            <>
              <Command.Empty className="branch-selector__empty">
                No matches.
              </Command.Empty>
              {items.map((entry) => (
                <Command.Item
                  key={entry.path}
                  value={entry.path}
                  className="file-finder__item"
                  onSelect={() => onPick(entry)}
                >
                  {entry.path}
                </Command.Item>
              ))}
            </>
          )}
        </Command.List>
        <p className="file-finder__hint">Esc to close · ↑↓ to navigate · ↵ to open</p>
      </Command>
    </div>
  );
}
