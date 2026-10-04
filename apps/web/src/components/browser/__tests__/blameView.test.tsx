import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { BlameResponse } from '../../../api/types/wiki';
import { BlameView } from '../BlameView';
import { blameRows } from '../blameViewModel';

const BLAME: BlameResponse = {
  ref: 'main',
  sha: 'c'.repeat(40),
  path: 'src/main.rs',
  line_count: 4,
  hunks: [
    { start_line: 1, line_count: 2, commit: 'a'.repeat(40) },
    { start_line: 3, line_count: 2, commit: 'b'.repeat(40) },
  ],
  commits: [
    {
      sha: 'a'.repeat(40),
      summary: 'feat: add the entry point',
      author: 'Ada Lovelace',
      authored_at: '2026-01-01T00:00:00Z',
      boundary: true,
    },
    {
      sha: 'b'.repeat(40),
      summary: 'feat: call run',
      author: 'Bea Fermat',
      authored_at: '2026-02-01T00:00:00Z',
      boundary: false,
    },
  ],
};

const TEXT = 'fn main() {\n    run();\n}\n// tail\n';

describe('blameViewModel', () => {
  it('puts each hunk on its first line, spanning the rest of it', () => {
    const { rows, total, truncated } = blameRows(TEXT, BLAME);
    expect(total).toBe(4);
    expect(truncated).toBe(false);
    expect(rows.map((row) => row.gutter?.commit.author ?? null)).toEqual([
      'Ada Lovelace',
      null,
      'Bea Fermat',
      null,
    ]);
    expect(rows[0]?.gutter?.lines).toBe(2);
    expect(rows[1]?.text).toBe('    run();');
  });

  it('leaves the gutter empty when there is no blame, or none for a line', () => {
    expect(blameRows(TEXT, undefined).rows.every((row) => row.gutter === null)).toBe(true);
    const partial = { ...BLAME, hunks: [BLAME.hunks[0]!] };
    expect(blameRows(TEXT, partial).rows[2]?.gutter).toBeNull();
  });

  it('keeps a hunk that crosses the line cap inside the lines shown', () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    const rows = blameRows(text, {
      ...BLAME,
      hunks: [{ start_line: 1, line_count: 10, commit: 'a'.repeat(40) }],
    }).rows;
    expect(rows[0]?.gutter?.lines).toBe(10);
  });
});

describe('BlameView', () => {
  it('shows an author gutter beside the lines, linking to the commit', () => {
    render(
      <MemoryRouter>
        <BlameView
          text={TEXT}
          blame={BLAME}
          fontSize={13}
          label="src/main.rs"
          commitHref={(sha) => `/commit/${sha}`}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('table', { name: 'Blame of src/main.rs' })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'feat: call run' })
    ).toHaveAttribute('href', `/commit/${'b'.repeat(40)}`);
    expect(screen.getByRole('link', { name: 'Line 4' })).toBeInTheDocument();
  });

  it('says an empty file is empty rather than drawing an empty table', () => {
    render(
      <MemoryRouter>
        <BlameView
          text=""
          blame={undefined}
          fontSize={13}
          label="empty.rs"
          commitHref={(sha) => `/commit/${sha}`}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('This file is empty.')).toBeInTheDocument();
  });
});
