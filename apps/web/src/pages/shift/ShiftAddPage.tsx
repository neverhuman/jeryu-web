// ShiftAddPage.tsx — Work → Add (`/work/shift/new`).
//
// Files todos into a family's queue: one todo from the text area, or with
// "Paste many" one todo per blank-line-separated paragraph. Now lands on
// today's bulletshift, Night on tonight's nightshift. Repos / priority /
// blocked-by are optional; without a title and repos the server files the
// todo untriaged and a worker triages it. Filing is admin-only.

import { Inbox } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { ShiftFamily, ShiftMode, ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { EmptyState, LoadingState, PermissionDeniedState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import { useFileShiftTodos, useShiftFamilies } from '../../hooks/useShift';
import { FamilyPicker, ShiftError, useSelectedFamily } from './shiftCommon';
import { SHIFT_PRIORITIES, parseList, splitParagraphs } from './shiftModel';
import { WorkTabs, queueHref } from './WorkTabs';

import '../page.css';
import './Shift.css';

export function ShiftAddPage(): JSX.Element {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const families = useShiftFamilies();
  const list = families.data?.families ?? [];
  const { family, setFamily } = useSelectedFamily(list);

  return (
    <div className="page page--wide" data-testid="shift-add-page">
      <header className="page__header">
        <h1 className="page__title">Work</h1>
        <p className="page__subtitle">
          File todos for the worker slots. Now lands on today&apos;s bulletshift;
          Night lands on tonight&apos;s nightshift.
        </p>
      </header>
      <WorkTabs />

      {!isAdmin ? (
        <PermissionDeniedState
          title="Only admins can file shift todos."
          description="Todos are committed to the family's queue branch and picked up by worker slots, so filing is limited to admins. You can still browse the Queue and Workers tabs."
          missingPermission="admin"
        />
      ) : families.isPending ? (
        <LoadingState title="Loading shift families…" variant="message" />
      ) : families.isError ? (
        <ShiftError title="Could not load shift families." error={families.error} />
      ) : !family ? (
        <EmptyState icon={Inbox} title="No shift queues to file into." />
      ) : (
        <AddForm family={family} families={list} onFamily={setFamily} />
      )}
    </div>
  );
}

function AddForm({
  family,
  families,
  onFamily,
}: {
  family: ShiftFamily;
  families: ShiftFamily[];
  onFamily: (name: string) => void;
}): JSX.Element {
  const file = useFileShiftTodos();
  const [many, setMany] = useState(false);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ShiftMode>('now');
  const [repos, setRepos] = useState<string[]>([]);
  const [priority, setPriority] = useState('');
  const [blockedBy, setBlockedBy] = useState('');
  const [filed, setFiled] = useState<ShiftTodo[]>([]);

  const paragraphs = many ? splitParagraphs(text) : text.trim() ? [text.trim()] : [];
  const count = paragraphs.length;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (count === 0) return;
    const optional = {
      ...(repos.length > 0 ? { repos } : {}),
      ...(priority ? { priority: Number(priority) } : {}),
      ...(parseList(blockedBy).length > 0 ? { blocked_by: parseList(blockedBy) } : {}),
    };
    const input = many
      ? { kind: 'bulk' as const, family: family.name, texts: paragraphs, mode, ...optional }
      : { kind: 'single' as const, family: family.name, text: paragraphs[0] ?? '', mode, ...optional };
    file.mutate(input, {
      onSuccess: (todos) => {
        setFiled(todos);
        setText('');
      },
    });
  };

  const toggleRepo = (name: string): void =>
    setRepos((current) =>
      current.includes(name) ? current.filter((r) => r !== name) : [...current, name]
    );

  const repoNames = [...family.repos].sort((a, b) => a.order - b.order).map((r) => r.name);

  return (
    <form className="shift-add" onSubmit={submit} aria-label="File shift todos">
      <div className="shift-add__row">
        {families.length > 1 ? (
          <span className="shift__toolbar">
            <FamilyPicker families={families} value={family.name} onChange={onFamily} />
          </span>
        ) : (
          <span className="shift__muted">Family: {family.name}</span>
        )}
        <fieldset className="shift-add__segmented">
          <legend>Shift</legend>
          {(['now', 'night'] as const).map((value) => (
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
        <label>
          <input type="checkbox" checked={many} onChange={(e) => setMany(e.target.checked)} />{' '}
          Paste many (one todo per paragraph)
        </label>
      </div>

      <label className="shift-add__field">
        {many ? 'Todos' : 'Todo'}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            many
              ? 'First todo…\n\nSecond todo (separate with a blank line)…'
              : 'What should a worker do? The first line becomes the title.'
          }
        />
      </label>
      <p className="shift__muted" data-testid="shift-add-count" aria-live="polite">
        {count} todo{count === 1 ? '' : 's'} will be filed as {mode}.
      </p>

      <details>
        <summary>Optional: repos, priority, blocked by</summary>
        <div className="shift-add__row">
          <fieldset className="shift-add__segmented">
            <legend>Repos</legend>
            {repoNames.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={repos.includes(name)}
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

      <span className="shift__actions">
        <ActionButton type="submit" variant="primary" disabled={count === 0 || file.isPending}>
          {file.isPending ? 'Filing…' : count > 1 ? `File ${count} todos` : 'File todo'}
        </ActionButton>
      </span>

      {file.error ? (
        <p className="shift__error" role="alert">
          {file.error.message}
        </p>
      ) : null}

      {filed.length > 0 ? (
        <div className="shift-add__filed" role="status" data-testid="shift-add-filed">
          <p>
            Filed {filed.length} todo{filed.length === 1 ? '' : 's'}:{' '}
            {filed.map((todo, i) => (
              <span key={todo.id}>
                {i > 0 ? ', ' : ''}
                <Link to={queueHref(family.name, [todo.id])}>{todo.id}</Link>
              </span>
            ))}
          </p>
          <Link to={queueHref(family.name, filed.map((t) => t.id))}>View in Queue</Link>
        </div>
      ) : null}
    </form>
  );
}
