// ReleaseBoardView.tsx — the family release board, the default view of
// /releases.
//
// One board per family, read from `GET /api/v1/release-board[/{family}]`
// (admin-only). A family pill picks the board; `?family=<name>` names it and
// the last pick is remembered. The board says how old its snapshot is and who
// took it, lists any source the collector could not read, and has three
// views: the deliverables (lanes of stages plus the work bar), pinned against
// released (when the family sends pins) and the release notes.
//
// When there is no board to show — a non-admin session, a server without the
// route, or no family has reported yet — the page says why in one line and
// shows the per-repository view (`fallback`) below it.

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import type { ReleaseBoard, ReleaseBoardListEntry } from '../../api/types/releaseBoard';
import { FamilyPicker } from '../../components/family/FamilyPills';
import { useAuth } from '../../hooks/useAuth';
import {
  useBoardEnvironments,
  useReleaseBoard,
  useReleaseBoardList,
} from '../../hooks/useReleaseBoard';
import { readBrowserText, writeBrowserText } from '../../storage/browserStorage';
import { BoardLanes } from './BoardLanes';
import { NotesPanel, PinsTable, ProblemList, WorkBar } from './BoardPanels';
import {
  BOARD_FAMILY_STORAGE_KEY,
  boardFreshness,
  forgeRepos,
  observedLine,
  pickFamily,
} from './model';

import '../../components/family/FamilyPills.css';
import './ReleaseBoard.css';

export const BOARD_NEEDS_ADMIN = 'The release board needs an admin session.';
export const BOARD_NONE_REPORTED =
  'No family has reported a board yet — the collector posts one every 5 minutes and after every release.';

function statusOf(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

export function ReleaseBoardView({ fallback }: { fallback: ReactNode }): JSX.Element {
  const { user, isPending } = useAuth();
  const admin = user?.role === 'admin';
  const list = useReleaseBoardList(admin);

  if (isPending || (admin && list.isLoading)) {
    return <p className="page__roadmap-note">Loading release boards…</p>;
  }
  if (!admin) {
    return (
      <BoardUnavailable fallback={fallback} testId="release-board-needs-admin">
        {BOARD_NEEDS_ADMIN} Below is what each environment of one repository runs.
      </BoardUnavailable>
    );
  }
  if (list.error) {
    const status = statusOf(list.error);
    if (status === 401 || status === 403) {
      return (
        <BoardUnavailable fallback={fallback} testId="release-board-needs-admin">
          {BOARD_NEEDS_ADMIN} Below is what each environment of one repository runs.
        </BoardUnavailable>
      );
    }
    if (status === 404) {
      return (
        <BoardUnavailable fallback={fallback} testId="release-board-none">
          {BOARD_NONE_REPORTED}
        </BoardUnavailable>
      );
    }
    return (
      <BoardUnavailable fallback={fallback} testId="release-board-error">
        The release board could not be read: {list.error.message}
      </BoardUnavailable>
    );
  }
  const boards = list.data?.boards ?? [];
  if (boards.length === 0) {
    return (
      <BoardUnavailable fallback={fallback} testId="release-board-none">
        {BOARD_NONE_REPORTED}
      </BoardUnavailable>
    );
  }
  return <BoardForFamily boards={boards} />;
}

function BoardUnavailable({
  fallback,
  testId,
  children,
}: {
  fallback: ReactNode;
  testId: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <>
      <p className="page__roadmap-note" role="status" data-testid={testId}>
        {children}
      </p>
      {fallback}
    </>
  );
}

function BoardForFamily({ boards }: { boards: ReleaseBoardListEntry[] }): JSX.Element {
  const [params, setParams] = useSearchParams();
  const family =
    pickFamily(
      boards,
      params.get('family'),
      readBrowserText('durable', BOARD_FAMILY_STORAGE_KEY)
    ) ?? '';
  const families = boards.map((entry) => entry.family);
  if (family && !families.includes(family)) families.push(family);

  const pick = (next: string): void => {
    writeBrowserText('durable', BOARD_FAMILY_STORAGE_KEY, next);
    setParams({ family: next });
  };

  return (
    <section className="page__section release-board" aria-label="Family release board" data-testid="release-board">
      <FamilyPicker families={families} family={family} onPick={pick} label="Family" />
      <FamilyBoard key={family} family={family} />
    </section>
  );
}

function FamilyBoard({ family }: { family: string }): JSX.Element {
  const query = useReleaseBoard(family, true);
  const board = query.data;
  const environments = useBoardEnvironments(board ? forgeRepos(board) : []);

  if (query.isLoading) {
    return <p className="page__roadmap-note">Loading the {family} board…</p>;
  }
  if (query.error) {
    return (
      <p className="page__roadmap-note" role="status" data-testid="release-board-family-error">
        {statusOf(query.error) === 404
          ? `No board has been reported for ${family} yet. The collector posts one every 5 minutes and after every release.`
          : `The ${family} board could not be read: ${query.error.message}`}
      </p>
    );
  }
  if (!board) return <p className="page__roadmap-note">Loading the {family} board…</p>;

  return (
    <>
      <BoardHeader board={board} fetchedAt={query.dataUpdatedAt} />
      <ProblemList problems={board.problems} />
      <BoardTabs board={board} environments={environments} />
    </>
  );
}

function BoardHeader({ board, fetchedAt }: { board: ReleaseBoard; fetchedAt: number }): JSX.Element {
  // Measured against when the snapshot was fetched, so render stays pure.
  const freshness = boardFreshness(board.observed_at, fetchedAt);
  return (
    <div className="release-board__head">
      <div className="release-board__title-row">
        <h2 className="release-board__family">{board.family}</h2>
        {freshness.stale ? (
          <span
            className="page__pill page__pill--warning"
            data-testid="release-board-stale"
            title={`Observed ${board.observed_at}`}
          >
            stale
          </span>
        ) : null}
      </div>
      <p className="release-board__summary" data-testid="release-board-summary">
        {board.summary}
      </p>
      <p className="release-board__muted" data-testid="release-board-observed">
        <time dateTime={board.observed_at} title={board.observed_at}>
          {observedLine(board, fetchedAt)}
        </time>
      </p>
    </div>
  );
}

type TabKey = 'deliverables' | 'pins' | 'notes';

const TAB_LABEL: Record<TabKey, string> = {
  deliverables: 'Deliverables',
  pins: 'Pinned vs released',
  notes: 'Release notes',
};

function BoardTabs({
  board,
  environments,
}: {
  board: ReleaseBoard;
  environments: Parameters<typeof BoardLanes>[0]['environments'];
}): JSX.Element {
  const tabs: TabKey[] = board.pins ? ['deliverables', 'pins', 'notes'] : ['deliverables', 'notes'];
  const [picked, setPicked] = useState<TabKey>('deliverables');
  const active = tabs.includes(picked) ? picked : 'deliverables';
  const tabId = (key: TabKey): string => `release-board-tab-${key}`;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = tabs.indexOf(active);
    let next: TabKey | undefined;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    setPicked(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <>
      <div className="release-board__tabs" role="tablist" aria-label={`${board.family} board views`}>
        {tabs.map((key) => (
          <button
            key={key}
            id={tabId(key)}
            type="button"
            role="tab"
            className="release-board__tab"
            aria-selected={key === active}
            aria-controls="release-board-panel"
            tabIndex={key === active ? 0 : -1}
            onClick={() => setPicked(key)}
            onKeyDown={onKeyDown}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>
      <div
        id="release-board-panel"
        role="tabpanel"
        aria-labelledby={tabId(active)}
        className="release-board__tabpanel"
      >
        {active === 'deliverables' ? (
          <>
            <BoardLanes board={board} environments={environments} />
            {board.work ? <WorkBar work={board.work} /> : null}
          </>
        ) : null}
        {active === 'pins' && board.pins ? <PinsTable pins={board.pins} /> : null}
        {active === 'notes' ? <NotesPanel notes={board.notes} /> : null}
      </div>
    </>
  );
}
