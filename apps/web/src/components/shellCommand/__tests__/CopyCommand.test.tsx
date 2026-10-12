// CopyCommand.test.tsx — the command is readable and reachable without a mouse.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CopyCommand } from '../CopyCommand';

describe('CopyCommand', () => {
  it('makes the scrolling command box a tab stop', () => {
    render(
      <CopyCommand
        command="just deploy --environment production --sha 01dfe68 --confirm"
        label="deploy command"
        where="Run on the deploy host, any directory"
      />
    );
    const box = screen.getByText(/--confirm/);
    // The box scrolls when the command is longer than the row, so a keyboard
    // can reach it and read the command through it.
    expect(box).toHaveAttribute('tabindex', '0');
  });

  it('names the copy button and says where the command runs', () => {
    render(<CopyCommand command="just deploy" label="deploy command" where="Run on node-0" />);
    const button = screen.getByRole('button', { name: 'Copy deploy command' });
    expect(button).toHaveAccessibleDescription('Run on node-0');
  });
});

describe('CopyCommand without a clipboard', () => {
  it('selects the command so it can be copied by hand', async () => {
    render(<CopyCommand command="just deploy --confirm" label="deploy command" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy deploy command' }));
    expect(await screen.findByText('Select and copy')).toBeInTheDocument();
    const box = screen.getByText('just deploy --confirm');
    const range = window.getSelection()?.getRangeAt(0);
    // The whole command box is the selection: it starts and ends inside it.
    expect(range?.startContainer).toBe(box);
    expect(range?.startOffset).toBe(0);
    expect(range?.endContainer).toBe(box);
    expect(range?.endOffset).toBe(box.childNodes.length);
    expect(screen.getByText('just deploy --confirm')).toHaveFocus();
  });
});
