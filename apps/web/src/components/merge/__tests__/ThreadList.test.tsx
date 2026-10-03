// ThreadList.test.tsx — the review threads of a pull request.
//
// A thread used to be one truncated line with no comment in it. Each one now
// shows its body and links to the file and line it is anchored to.

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ThreadList } from '../ThreadList';
import { reviewThread } from '../../../test/fixtures/pullRequest';
import { pullFileHref } from '../../../pages/pullTabsModel';

const BASE = '/repos/acme/acme/widget-api/pulls/32';

function show(threads = [reviewThread()]): void {
  render(
    <MemoryRouter>
      <ThreadList
        threads={threads}
        anchorHref={(thread) =>
          thread.file_path ? pullFileHref(BASE, thread.file_path, thread.line) : null
        }
      />
    </MemoryRouter>
  );
}

describe('ThreadList', () => {
  it('shows the comment body and links to the file it is anchored to', () => {
    show();
    const thread = screen.getByTestId('pr-thread');
    expect(within(thread).getByTestId('pr-thread-body')).toHaveTextContent(
      'This branch swallows the error; say why it failed.'
    );
    expect(within(thread).getByRole('link', { name: 'src/login.rs:42' })).toHaveAttribute(
      'href',
      `${BASE}/files?path=src%2Flogin.rs#L42`
    );
    expect(screen.getByTestId('pr-threads-count')).toHaveTextContent('1 unresolved');
  });

  it('puts unresolved threads first and marks the resolved ones', () => {
    show([
      reviewThread({ id: 'a', resolved: true, file_path: 'src/a.rs', line: 1 }),
      reviewThread({ id: 'b', resolved: false, file_path: 'src/b.rs', line: 2 }),
    ]);
    const items = screen.getAllByTestId('pr-thread');
    expect(items[0]).toHaveAttribute('data-resolved', 'false');
    expect(items[1]).toHaveAttribute('data-resolved', 'true');
    expect(screen.getByTestId('pr-threads-count')).toHaveTextContent('1 unresolved');
  });

  it('says so when a thread is anchored to no file', () => {
    show([reviewThread({ file_path: null, line: null })]);
    expect(screen.getByText('On the pull request')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says there are none rather than showing an empty list', () => {
    show([]);
    expect(screen.getByTestId('pr-threads-empty')).toBeInTheDocument();
  });
});
