// useListKeys.test.tsx — j/k move the focused row, o and Enter open it, x runs
// its one action; the overlay learns all four keys.

import { fireEvent, render, screen } from '@testing-library/react';
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
