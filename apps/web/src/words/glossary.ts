// glossary.ts — the canonical words this UI uses, and the synonyms it must not.
//
// Every noun the product shows the operator has exactly one name. When two
// names for one thing both ship, a reader has to learn that "PR" and "pull
// request" are the same thing, that a "lane" is sometimes a release-board row
// and sometimes something a worker runs in, and that a "task" and a "todo" are
// one queue entry. This module is the single list of those decisions:
//
//   * `GLOSSARY` is rendered in the help overlay, so the words the UI uses and
//     the words it documents cannot drift apart.
//   * `bannedTermsIn` powers the guard test
//     (`src/__tests__/glossary-terms.test.ts`), which fails when a banned
//     synonym reappears in a user-facing string.
//
// Code names (types, fields, query keys, test ids, wire payloads) are out of
// scope: `activeTasks` stays `activeTasks` while the API says so. The rule is
// about what the operator reads.

/** A word the UI must not use, and the canonical word to use instead. */
export interface BannedSynonym {
  /** The synonym as it reads in copy. */
  readonly word: string;
  /** Matches the synonym inside a user-facing string. */
  readonly pattern: RegExp;
  /** The replacement to write instead. */
  readonly instead: string;
}

/** One canonical term: what it means, and what the UI must not call it. */
export interface GlossaryEntry {
  /** The canonical term, as it reads mid-sentence. */
  readonly term: string;
  /** One line: what the term names in this product. */
  readonly meaning: string;
  /** Synonyms banned from user-facing strings. */
  readonly banned: readonly BannedSynonym[];
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'pull request',
    meaning:
      'A change proposed from a head branch into a base branch, with its checks, reviews and merge state.',
    banned: [
      {
        word: 'PR',
        // Capitalised and whole-word, so `open_prs` sort keys and
        // `pr-redteam` runner ids stay untouched.
        pattern: /\bPRs?\b/,
        instead: 'pull request / pull requests',
      },
    ],
  },
  {
    term: 'todo',
    meaning:
      'One entry in the shared work queue: what a worker claims, carries to a pull request, and reports back.',
    banned: [
      {
        word: 'task',
        pattern: /\btasks?\b/i,
        instead: 'todo / todos',
      },
    ],
  },
  {
    term: 'lane',
    meaning:
      'A row on a family release board: one deliverable and the stages it moves through. Only release boards have lanes — elsewhere a set of rows under one heading is a group.',
    banned: [
      {
        word: 'swimlane',
        pattern: /\bswim-? ?lanes?\b/i,
        instead: 'lane',
      },
      {
        word: 'worker lane',
        // The thing a worker runs in is its checkout, not a lane.
        pattern: /\b(worker|runner|agent) lanes?\b/i,
        instead: 'worker checkout',
      },
    ],
  },
  {
    term: 'worker',
    meaning:
      'The process that claims a todo, works it in its own checkout, and opens the pull request for it.',
    banned: [
      {
        word: 'bot',
        pattern: /\bbots?\b/i,
        instead: 'worker / agent',
      },
    ],
  },
];

/** Every banned synonym in the glossary, flattened, in glossary order. */
export const BANNED_SYNONYMS: readonly BannedSynonym[] = GLOSSARY.flatMap(
  (entry) => entry.banned
);

/** The banned synonyms `text` uses, in glossary order; empty when it is clean. */
export function bannedTermsIn(text: string): BannedSynonym[] {
  return BANNED_SYNONYMS.filter((banned) => banned.pattern.test(text));
}
