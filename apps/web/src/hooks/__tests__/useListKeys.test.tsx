// useListKeys.test.tsx — j/k move the focused row, o and Enter open it, x runs
// its one action; the overlay learns all four keys.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KeyboardProvider, useKeyboardRegistry } from '../useKeyboard';
import { LIST_ACTION_PROP, LIST_OPEN_PROP, listRowProps, useListKeys } from '../useListKeys';

function List({
  onOpen,
  onAction,
}: {
  onOpen?: (title: string) => void;
  onAction?: (title: string) => void;
}): JSX.Element {
  const rows = useListKeys<HTMLUListElement>();
  return (
    <ul ref={rows}>
      {['first', 'second'].map((title) => (
        <li key={title} data-testid={`row-${title}`} {...listRowProps}>
          <a href={`/${title}`} {...LIST_OPEN_PROP} onClick={(e) => {
            e.preventDefault();
            onOpen?.(title);
          }}>
            {title}
          </a>
          <button type="button" {...LIST_ACTION_PROP} onClick={() => onAction?.(title)}>
            Run
          </button>
        </li>
      ))}
      <li data-testid="row-folded" hidden {...listRowProps}>
        folded
      </li>
    </ul>
  );
}

function ReusedList({
  ids,
  onAction,
}: {
  ids: string[];
  onAction?: (id: string) => void;
}): JSX.Element {
  const rows = useListKeys<HTMLUListElement>();
  return (
    <ul ref={rows}>
      {ids.map((id, index) => (
        // Index identity on purpose: React reuses the DOM node when a row is
        // prepended, which is the case the ring has to follow `data-list-key` through.
        <li key={index} data-testid={`row-${id}`} data-list-key={id} {...listRowProps}>
          <a href={`/${id}`} {...LIST_OPEN_PROP}>
            {id}
          </a>
          <button type="button" {...LIST_ACTION_PROP} onClick={() => onAction?.(id)}>
            Run
          </button>
        </li>
      ))}
    </ul>
  );
}

function LateList({ ids }: { ids: string[] | null }): JSX.Element {
  const rows = useListKeys<HTMLUListElement>();
  if (ids === null) return <p>empty</p>;
  return (
    <ul ref={rows}>
      {ids.map((id, index) => (
        <li key={index} data-testid={`row-${id}`} data-list-key={id} {...listRowProps}>
          {id}
        </li>
      ))}
    </ul>
  );
}

function Keys(): JSX.Element {
  const { shortcuts } = useKeyboardRegistry();
  return <p>{shortcuts.map((s) => s.combo).join(' ')}</p>;
}

describe('useListKeys', () => {
  it('moves with j and k, stopping at both ends', () => {
    render(<List />);
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByTestId('row-first')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByTestId('row-second')).toHaveAttribute('data-list-focused', 'true');
    expect(screen.getByTestId('row-first')).not.toHaveAttribute('data-list-focused');
    // Past the last reachable row: a hidden row is not one, and j holds here.
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByTestId('row-second')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByTestId('row-first')).toHaveFocus();
  });

  it('opens the focused row with o and with Enter, and runs its action with x', () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    render(<List onOpen={onOpen} onAction={onAction} />);
    // Nothing focused: the row keys do nothing at all.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith('second');
    fireEvent.keyDown(window, { key: 'o' });
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'x' });
    expect(onAction).toHaveBeenCalledWith('second');
  });

  it('leaves typing alone', () => {
    const onOpen = vi.fn();
    render(
      <>
        <List onOpen={onOpen} />
        <input aria-label="Filter" />
      </>
    );
    const input = screen.getByLabelText('Filter');
    input.focus();
    fireEvent.keyDown(input, { key: 'j' });
    expect(screen.getByTestId('row-first')).not.toHaveAttribute('data-list-focused');
    expect(input).toHaveFocus();
  });

  it('does not move the list while a dialog is open', () => {
    const onAction = vi.fn();
    render(
      <>
        <List onAction={onAction} />
        <div role="dialog" aria-modal="true">
          Shortcuts
        </div>
      </>
    );
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByTestId('row-first')).not.toHaveAttribute('data-list-focused');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps the keyboard on the same row when a live list reuses its nodes', async () => {
    const onAction = vi.fn();
    const { rerender } = render(<ReusedList ids={['a', 'b']} onAction={onAction} />);
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByTestId('row-b')).toHaveAttribute('data-list-focused', 'true');
    await act(async () => {
      rerender(<ReusedList ids={['c', 'a', 'b']} onAction={onAction} />);
    });
    expect(screen.getByTestId('row-b')).toHaveFocus();
    expect(screen.getByTestId('row-b')).toHaveAttribute('data-list-focused', 'true');
    expect(screen.getByTestId('row-a')).not.toHaveAttribute('data-list-focused');
    fireEvent.keyDown(window, { key: 'x' });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('b');
  });

  it('follows a reused row when the list mounts after an empty view', async () => {
    const { rerender } = render(<LateList ids={null} />);
    expect(screen.queryByTestId('row-a')).toBeNull();
    rerender(<LateList ids={['a', 'b']} />);
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByTestId('row-b')).toHaveAttribute('data-list-focused', 'true');
    await act(async () => {
      rerender(<LateList ids={['c', 'a', 'b']} />);
    });
    expect(screen.getByTestId('row-b')).toHaveAttribute('data-list-focused', 'true');
    expect(screen.getByTestId('row-c')).not.toHaveAttribute('data-list-focused');
  });

  it('drops the ring when the focused row leaves and its node is reused', async () => {
    const onAction = vi.fn();
    const { rerender } = render(<ReusedList ids={['a', 'b']} onAction={onAction} />);
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    await act(async () => {
      rerender(<ReusedList ids={['c', 'a']} onAction={onAction} />);
    });
    expect(screen.getByTestId('row-a')).not.toHaveAttribute('data-list-focused');
    expect(screen.getByTestId('row-c')).not.toHaveAttribute('data-list-focused');
    expect(screen.getByTestId('row-a')).not.toHaveFocus();
    fireEvent.keyDown(window, { key: 'x' });
    expect(onAction).not.toHaveBeenCalled();
  });

  it('tells the shortcuts overlay about all four keys', () => {
    render(
      <KeyboardProvider>
        <List />
        <Keys />
      </KeyboardProvider>
    );
    expect(screen.getByText('j k o enter x')).toBeInTheDocument();
  });
});
