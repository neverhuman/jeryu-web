// CopyCommand.test.tsx — the command is readable and reachable without a mouse.

import { render, screen } from '@testing-library/react';
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
    render(<CopyCommand command="just deploy" label="deploy command" where="Run on xbabe0" />);
    const button = screen.getByRole('button', { name: 'Copy deploy command' });
    expect(button).toHaveAccessibleDescription('Run on xbabe0');
  });
});
