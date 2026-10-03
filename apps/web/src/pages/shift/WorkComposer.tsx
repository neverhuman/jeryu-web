// WorkComposer.tsx — add work, at the top of the Work page.
//
// One row: the family, Now or Night (Night by default: most work is for the
// night shift), one line of text and one filled button. Focusing the text or
// pressing "More options" opens the full form in place: several lines, "paste
// many" (one
// todo per blank-line-separated paragraph), repos, priority, blocked by. The
// family starts at the shell's family scope, so work is filed where the
// operator is looking. Without
// a title and repos the server files the todo untriaged and a worker triages
// it. Filing is admin-only; after filing the composer clears and closes, and
// the page highlights the new todos in the queue below.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';

import type { ShiftFamily, ShiftMode, ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { sameFamily } from '../../components/family/familyScope';
import { useFileShiftTodos } from '../../hooks/useShift';
import { SHIFT_PRIORITIES, parseList, splitParagraphs } from './shiftModel';
import { WORK_ADD_ID } from './workPaths';

export function WorkComposer({
  families,
  family,
  isAdmin,
  onFiled,
}: {
  families: ShiftFamily[];
  /** The shell's family scope ('' = every family): preselects the composer. */
  family: string;
  isAdmin: boolean;
  onFiled: (family: string, todos: ShiftTodo[]) => void;
}): JSX.Element {
  const file = useFileShiftTodos();
  const { hash } = useLocation();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<{ under: string; name: string } | null>(null);
  const [many, setMany] = useState(false);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ShiftMode>('night');
  const [repos, setRepos] = useState<string[]>([]);
  const [priority, setPriority] = useState('');
  const [blockedBy, setBlockedBy] = useState('');
  const lineRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // The shell's family scope is the composer's family, from the first paint on:
  // work is filed where the operator is looking. The select still changes it,
  // and that pick stands until the scope moves; with no scope the composer
  // still needs a choice, and the first family of the list is it.
  if (pick && pick.under !== family) setPick(null);
  const target =
    families.find((f) => f.name === pick?.name) ??
    families.find((f) => sameFamily(f.name, family)) ??
    families[0];

  // `/work#add` ("Add work" in the palette, the old Add tab) lands in the text.
  useEffect(() => {
    if (hash === `#${WORK_ADD_ID}`) lineRef.current?.focus();
  }, [hash]);
  useEffect(() => {
    if (open) areaRef.current?.focus();
  }, [open]);

  if (!isAdmin) {
    return (
      <section id={WORK_ADD_ID} className="work-composer" aria-label="Add work">
        <p className="shift__muted" data-testid="work-composer-readonly">
          Only admins can file todos: they are committed to a family&apos;s queue and picked up by
          worker slots.
        </p>
      </section>
    );
  }
  if (!target) {
    return (
      <section id={WORK_ADD_ID} className="work-composer" aria-label="Add work">
        <p className="shift__muted">No shift queue to file into yet.</p>
      </section>
    );
  }

  const paragraphs = many ? splitParagraphs(text) : text.trim() ? [text.trim()] : [];
  const count = paragraphs.length;
  const repoNames = [...target.repos].sort((a, b) => a.order - b.order).map((r) => r.name);
  const pickedRepos = repos.filter((name) => repoNames.includes(name));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (count === 0) return;
    const optional = {
      ...(pickedRepos.length > 0 ? { repos: pickedRepos } : {}),
      ...(priority ? { priority: Number(priority) } : {}),
      ...(parseList(blockedBy).length > 0 ? { blocked_by: parseList(blockedBy) } : {}),
    };
    const input = many
      ? { kind: 'bulk' as const, family: target.name, texts: paragraphs, mode, ...optional }
      : { kind: 'single' as const, family: target.name, text: paragraphs[0] ?? '', mode, ...optional };
    file.mutate(input, {
      onSuccess: (todos) => {
        setText('');
        setMany(false);
        setRepos([]);
        setPriority('');
        setBlockedBy('');
        setOpen(false);
        onFiled(target.name, todos);
      },
    });
  };

  const toggleRepo = (name: string): void =>
    setRepos((current) =>
      current.includes(name) ? current.filter((r) => r !== name) : [...current, name]
    );

  return (
    <section id={WORK_ADD_ID} className="work-composer" aria-label="Add work">
      <form className="work-composer__form" onSubmit={submit} aria-label="File shift todos">
        <div className="work-composer__row">
          <label className="work-composer__family">
            <span className="sr-only">Family</span>
            <select
              aria-label="Family"
              value={target.name}
              onChange={(event) => setPick({ under: family, name: event.target.value })}
            >
              {families.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="shift-add__segmented">
            <legend className="sr-only">Shift</legend>
            {(['night', 'now'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="shift-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />{' '}
                {value === 'now' ? 'Now' : 'Night'}
              </label>
            ))}
          </fieldset>
          {open ? null : (
            <input
              ref={lineRef}
              className="work-composer__line"
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onFocus={() => setOpen(true)}
              placeholder="What should be done?"
              aria-label="What should be done?"
            />
          )}
          <ActionButton type="submit" variant="primary" disabled={count === 0 || file.isPending}>
            {file.isPending ? 'Filing…' : count > 1 ? `File ${count} todos` : 'File todo'}
          </ActionButton>
          <button
            type="button"
            className="action-button action-button--ghost"
            aria-expanded={open}
            aria-controls="work-composer-more"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Fewer options' : 'More options'}
          </button>
        </div>

        <div id="work-composer-more" hidden={!open}>
          {open ? (
            <>
              <label className="shift-add__field">
                {many ? 'Todos' : 'Todo'}
                <textarea
                  ref={areaRef}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={
                    many
                      ? 'First todo…\n\nSecond todo (separate with a blank line)…'
                      : 'What should a worker do? The first line becomes the title.'
                  }
                />
              </label>
              <div className="shift-add__row">
                <label>
                  <input
                    type="checkbox"
                    checked={many}
                    onChange={(e) => setMany(e.target.checked)}
                  />{' '}
                  Paste many (one todo per paragraph)
                </label>
                <span className="shift__muted" data-testid="shift-add-count" aria-live="polite">
                  {count} todo{count === 1 ? '' : 's'} will be filed as {mode} for {target.name}.
                </span>
              </div>
              <details>
                <summary>Optional: repos, priority, blocked by</summary>
                <div className="shift-add__row">
                  <fieldset className="shift-add__segmented">
                    <legend>Repos</legend>
                    {repoNames.map((name) => (
                      <label key={name}>
                        <input
                          type="checkbox"
                          checked={pickedRepos.includes(name)}
                          onChange={() => toggleRepo(name)}
                        />{' '}
                        {name}
                      </label>
                    ))}
                  </fieldset>
                  <label className="shift-add__field">
                    Priority
                    <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                      <option value="">Default</option>
                      {SHIFT_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          P{p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="shift-add__field">
                    Blocked by (todo ids)
                    <input value={blockedBy} onChange={(event) => setBlockedBy(event.target.value)} />
                  </label>
                </div>
              </details>
            </>
          ) : null}
        </div>

        {file.error ? (
          <p className="shift__error" role="alert">
            {file.error.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
