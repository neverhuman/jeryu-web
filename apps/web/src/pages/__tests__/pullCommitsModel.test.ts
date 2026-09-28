import { describe, expect, it } from 'vitest';

import {
  commitAuthorName,
  groupCommitsByDay,
  hasCommitDetail,
  parseCommitMessage,
  shortSha,
  type PullCommit,
} from '../pullCommitsModel';

function commit(
  sha: string,
  message: string,
  date: string,
  name = 'Shift Worker'
): PullCommit {
  return {
    sha,
    html_url: `/repos/jeryu/jeryu/jeryu-deploy/commit/${sha}`,
    commit: { message, author: { name, email: 'w@example.invalid', date } },
    parents: [{ sha: 'parent' }],
  };
}

describe('parseCommitMessage', () => {
  it('splits subject, body paragraphs and the trailer block', () => {
    const parsed = parseCommitMessage(
      'Show a PR’s commits on the PR page\n\n' +
        'A reviewer could not read what landed.\n' +
        'The Commits section shows it.\n\n' +
        'Second paragraph.\n\n' +
        'Todo: 20260925-160159-76f16d\nWorked-by: w1\nShift: dayshift/2026-09-28\n'
    );
    expect(parsed.subject).toBe('Show a PR’s commits on the PR page');
    expect(parsed.paragraphs).toEqual([
      'A reviewer could not read what landed.\nThe Commits section shows it.',
      'Second paragraph.',
    ]);
    expect(parsed.trailers).toEqual([
      { key: 'Todo', value: '20260925-160159-76f16d' },
      { key: 'Worked-by', value: 'w1' },
      { key: 'Shift', value: 'dayshift/2026-09-28' },
    ]);
  });

  it('keeps a key/value line that is part of the prose in the body', () => {
    const parsed = parseCommitMessage(
      'subject\n\nTodo: not a trailer here\nbecause prose follows it.\n'
    );
    expect(parsed.trailers).toEqual([]);
    expect(parsed.paragraphs).toEqual([
      'Todo: not a trailer here\nbecause prose follows it.',
    ]);
  });

  it('reads a subject-only message and an empty one', () => {
    expect(parseCommitMessage('just a subject')).toEqual({
      subject: 'just a subject',
      paragraphs: [],
      trailers: [],
    });
    expect(parseCommitMessage('')).toEqual({
      subject: '',
      paragraphs: [],
      trailers: [],
    });
  });
});

describe('commit detail and identity', () => {
  it('marks only commits with a body or trailers as expandable', () => {
    expect(hasCommitDetail(commit('a', 'subject', '2026-09-28T09:00:00Z'))).toBe(
      false
    );
    expect(
      hasCommitDetail(commit('b', 'subject\n\nTodo: x\n', '2026-09-28T09:00:00Z'))
    ).toBe(true);
  });

  it('shortens the sha and falls back to the committer for the name', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456');
    expect(
      commitAuthorName({
        sha: 'a',
        commit: {
          message: 's',
          author: null,
          committer: { name: 'Committer', date: '2026-09-28T09:00:00Z' },
        },
      })
    ).toBe('Committer');
  });
});

describe('groupCommitsByDay', () => {
  it('groups consecutive days and keeps the server order', () => {
    const groups = groupCommitsByDay([
      commit('a', 'one', '2026-09-27T10:00:00Z'),
      commit('b', 'two', '2026-09-28T09:00:00Z'),
      commit('c', 'three', '2026-09-28T11:00:00Z'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.commits.map((c) => c.sha)).toEqual(['a']);
    expect(groups[1]?.commits.map((c) => c.sha)).toEqual(['b', 'c']);
    expect(groups[1]?.label).not.toBe('Date unknown');
  });

  it('puts commits with no readable date under one unknown group', () => {
    const groups = groupCommitsByDay([
      { sha: 'a', commit: { message: 'one' } },
      { sha: 'b', commit: { message: 'two', author: { date: 'nonsense' } } },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Date unknown');
    expect(groups[0]?.commits).toHaveLength(2);
  });

  it('has no groups for no commits', () => {
    expect(groupCommitsByDay([])).toEqual([]);
  });
});
