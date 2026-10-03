// ReleaseBoardView.tsx — the family release board, the default view of
// /releases.
//
// One board per family, read from `GET /api/v1/release-board[/{family}]`
// (admin-only). A family pill links to the board's address,
// `/releases/family/<name>`, and the last pick is remembered. Each lane is
// `#lane-<id>`: a URL with that hash scrolls to the lane once the board has
// loaded and rings it briefly (without the glide under reduced motion). The
// board says how old its snapshot is and who took it, warns about anything not
// shipped yet (stages marked warn or bad, pins not level, merged or stranded
// work), lists any source the collector could not read, and has three views: the deliverables (lanes of stages plus the work bar), pinned against
// released (when the family sends pins) and the release notes.
//
// When there is no board to show — a non-admin session, a server without the
// route, or no family has reported yet — the page says why on a shared state
// surface (and offers a Retry when the read itself failed) and shows the
// per-repository view (`fallback`) below it.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { ApiError } from '../../api/client';
import type { ReleaseBoard, ReleaseBoardListEntry } from '../../api/types/releaseBoard';
import { FamilyPicker } from '../../components/family/FamilyPills';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import {
  useBoardEnvironments,
  useReleaseBoard,
  useReleaseBoardList,
} from '../../hooks/useReleaseBoard';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useViewState } from '../../hooks/useViewState';
import { readBrowserText, writeBrowserText } from '../../storage/browserStorage';
import { BoardLanes } from './BoardLanes';
import { laneAnchorId, laneFromHash, releaseFamilyPath } from './links';
import { NotesPanel, PinsTable, ProblemList, UnshippedBanner, WorkBar } from './BoardPanels';
import {
  BOARD_FAMILY_STORAGE_KEY,
  boardFreshness,
  forgeRepos,
  observedLine,
  pickFamily,
} from './model';

import '../../components/family/FamilyPills.css';
import './ReleaseBoard.css';
import { absoluteText, rfc3339Seconds } from '../../format/when';

export const BOARD_NEEDS_ADMIN = 'The release board needs an admin session.';
export const BOARD_NONE_REPORTED =
  'No family has reported a board yet — the collector posts one every 5 minutes and after every release.';

function statusOf(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

/** How long a lane reached by `#lane-<id>` stays ringed. */
export const LANE_HIGHLIGHT_MS = 2_500;

/** The class that rings a lane reached by its anchor. */
export const LANE_TARGET_CLASS = 'release-board__lane--target';

export function ReleaseBoardView({
  family,
  fallback,
}: {
  /** The family the URL names, or null for the remembered or first one. */
  family: string | null;
  fallback: ReactNode;
}): JSX.Element {
  const { user, isPending } = useAuth();
  const admin = user?.role === 'admin';
  const list = useReleaseBoardList(admin);

  if (isPending || (admin && list.isLoading)) {
    return <LoadingState variant="message" title="Loading release boards…" />;
  }
  if (!admin) {
    return <BoardUnavailable fallback={fallback}>{needsAdmin()}</BoardUnavailable>;
  }
  if (list.error) {
    const status = statusOf(list.error);
    if (status === 401 || status === 403) {
      return <BoardUnavailable fallback={fallback}>{needsAdmin()}</BoardUnavailable>;
    }
    if (status === 404) {
      return <BoardUnavailable fallback={fallback}>{noneReported()}</BoardUnavailable>;
    }
    return (
      <BoardUnavailable fallback={fallback}>
        <ErrorState
          title="The release board could not be read."
          error={list.error}
          onRetry={() => void list.refetch()}
          testId="release-board-error"
        />
      </BoardUnavailable>
    );
  }
  const boards = list.data?.boards ?? [];
  if (boards.length === 0) {
    return <BoardUnavailable fallback={fallback}>{noneReported()}</BoardUnavailable>;
  }
  return <BoardForFamily boards={boards} requested={family} />;
}

function needsAdmin(): JSX.Element {
  return (
    <EmptyState
      icon={Lock}
      title={BOARD_NEEDS_ADMIN}
      description="Below is what each environment of one repository runs."
      testId="release-board-needs-admin"
    />
  );
}

function noneReported(): JSX.Element {
  return <EmptyState title={BOARD_NONE_REPORTED} testId="release-board-none" />;
}

function BoardUnavailable({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <>
      {children}
      {fallback}
    </>
  );
}

function BoardForFamily({
  boards,
  requested,
}: {
  boards: ReleaseBoardListEntry[];
  requested: string | null;
}): JSX.Element {
  const scope = useFamilyScope();
  const family =
    pickFamily(boards, requested, readBrowserText('durable', BOARD_FAMILY_STORAGE_KEY)) ?? '';
  const families = boards.map((entry) => entry.family);
  if (family && !families.includes(family)) families.push(family);

  // Picking a board is picking a family: the whole shell follows it.
  const remember = (next: string): void => {
    writeBrowserText('durable', BOARD_FAMILY_STORAGE_KEY, next);
    scope.setFamily(next);
  };

  return (
    <section className="page__section release-board" aria-label="Family release board" data-testid="release-board">
      <FamilyPicker
        families={families}
        family={family}
        onPick={remember}
        hrefOf={releaseFamilyPath}
        label="Family"
      />
      <FamilyBoard key={family} family={family} />
    </section>
  );
}

function FamilyBoard({ family }: { family: string }): JSX.Element {
  const query = useReleaseBoard(family, true);
  const board = query.data;
  const environments = useBoardEnvironments(board ? forgeRepos(board) : []);
  useLaneFromHash(board ?? null);

  if (query.isLoading) {
    return <LoadingState variant="message" title={`Loading the ${family} board…`} />;
  }
  if (query.error) {
    return statusOf(query.error) === 404 ? (
      <EmptyState
        title={`No board has been reported for ${family} yet.`}
        description="The collector posts one every 5 minutes and after every release."
        testId="release-board-family-error"
      />
    ) : (
      <ErrorState
        title={`The ${family} board could not be read.`}
        error={query.error}
        onRetry={() => void query.refetch()}
        testId="release-board-family-error"
      />
    );
  }
  if (!board) {
    return <LoadingState variant="message" title={`Loading the ${family} board…`} />;
  }

  return (
    <>
      <BoardHeader board={board} fetchedAt={query.dataUpdatedAt} />
      <UnshippedBanner board={board} />
      <ProblemList problems={board.problems} />
      <BoardTabs board={board} environments={environments} />
    </>
  );
}

/**
 * The lane `#lane-<id>` names, once the board that has it is drawn: scroll it
 * into view and ring it for {@link LANE_HIGHLIGHT_MS}. Done once per hash, so
 * the 30 s refetch does not scroll the page back. The ring is a class put on
 * the element directly: it is a moment of DOM feedback, not page state.
 */
function useLaneFromHash(board: ReleaseBoard | null): void {
  const { hash } = useLocation();
  const reducedMotion = usePrefersReducedMotion();
  const done = useRef<string | null>(null);
  const laneId = laneFromHash(hash);
  const present = board !== null && laneId !== null && board.lanes.some((lane) => lane.id === laneId);

  useEffect(() => {
    if (!present || laneId === null || done.current === hash) return;
    const element = document.getElementById(laneAnchorId(laneId));
    if (!element) return;
    done.current = hash;
    element.scrollIntoView?.({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    element.classList.add(LANE_TARGET_CLASS);
    const timer = window.setTimeout(
      () => element.classList.remove(LANE_TARGET_CLASS),
      LANE_HIGHLIGHT_MS
    );
    return () => {
      window.clearTimeout(timer);
      element.classList.remove(LANE_TARGET_CLASS);
    };
  }, [present, laneId, hash, reducedMotion]);
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
        <time dateTime={rfc3339Seconds(board.observed_at) ?? undefined} title={absoluteText(board.observed_at)}>
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
  // `?tab=` says which view the board is on. A tab switch pushes, so Back
  // returns to the tab before it.
  const view = useViewState();
  const picked = view.read('tab') as TabKey;
  const active = tabs.includes(picked) ? picked : 'deliverables';
  const setPicked = (key: TabKey): void =>
    view.write({ tab: key === 'deliverables' ? null : key }, 'push');
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
