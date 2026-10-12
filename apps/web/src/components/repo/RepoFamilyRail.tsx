// RepoFamilyRail.tsx — the family, on the left of its repositories' pages.
//
// A split family used to have a page of its own (`/repos/family/<key>`) that
// drew a second browser: a member rail, a tree and a preview, with no pull
// requests, no tabs, no settings, and a ref and open file that no link could
// carry. The family is not another page — it is the context of the repository
// being read, so it is a rail inside the one repository shell: the rollup and
// the member repositories on the left, the repository's own tabs and content
// on the right. `/repos/family/<key>` now lands on a member.
//
// A switch keeps the tab: from one member's pull requests to the next one's.
// Alt+Up and Alt+Down are the same move from the keyboard. The rail also
// writes the shell-wide family scope, so opening a repository puts its family
// in scope for every page after it.
//
// Three widths, because a 220px rail is not something a phone has to spare:
// at 1280px and up the rail is simply there; from 720px it is a toggle whose
// choice is remembered; below that the header carries a select.

import { GitMerge, PanelLeftClose, PanelLeftOpen, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { livePresenceCount, presenceView } from '../../api/agentPresence';
import type { RepositorySummary } from '../../api/types';
import { useFamilyAgentPresence } from '../../hooks/useAgentPresence';
import { useTickingNow } from '../../hooks/useTickingNow';
import { CompactPresenceList } from '../../pages/agents/PresenceList';
import { useKeyboardShortcut } from '../../hooks/useKeyboard';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useRepositories } from '../../hooks/useRepositories';
import { pullRoomFamilyHref } from '../../pages/pullRoomModel';
import type { RepoTabKey } from '../../pages/repoShellModel';
import {
  readBrowserText,
  writeBrowserText,
} from '../../storage/browserStorage';
import { canonicalFamily, sameFamily } from '../family/familyScope';
import { useFamilyScope } from '../family/FamilyScopeProvider';
import { ActionButton } from '../action/ActionButton';

import { aggregateFamily, formatFamilyName, type FamilyRollup } from './familyRollup';
import {
  FAMILY_RAIL_FULL_WIDTH,
  FAMILY_RAIL_KEY,
  FAMILY_RAIL_SELECT_WIDTH,
  familyMemberHref,
  memberPullsLabel,
  neighbourMember,
  sortFamilyMembers,
  type FamilyRailTier,
} from './repoFamilyRailModel';

export const FAMILY_RAIL_ID = 'repo-family-rail';

/** What the shell needs to draw the family, wherever each piece belongs. */
export interface FamilyRail {
  /** The family as the forge spells it (what the list endpoint filters on). */
  family: string;
  /** What a reader calls it. */
  label: string;
  tier: FamilyRailTier;
  members: RepositorySummary[];
  rollup: FamilyRollup;
  /** The member whose page this is, once the family has been read. */
  current: RepositorySummary | null;
  /** True while the rail itself is on screen. */
  open: boolean;
  toggle: () => void;
  hrefFor: (repo: RepositorySummary) => string;
}

/**
 * The family of the repository this page is of, and the state of its rail.
 * `family` empty — a repository the forge puts in no family — returns null,
 * and the shell gives the content the full width.
 */
export function useFamilyRail(
  family: string | null | undefined,
  repoId: string | null,
  tab: RepoTabKey
): FamilyRail | null {
  const navigate = useNavigate();
  const scope = useFamilyScope();
  const key = family ?? '';
  const canonical = canonicalFamily(key);
  const list = useRepositories({ family: key, sort: 'name' }, { enabled: key !== '' });
  const members = useMemo(
    () => sortFamilyMembers(list.data?.repositories ?? []),
    [list.data?.repositories]
  );

  const wide = useMediaQuery(`(min-width: ${FAMILY_RAIL_FULL_WIDTH}px)`);
  const phone = useMediaQuery(`(max-width: ${FAMILY_RAIL_SELECT_WIDTH - 1}px)`);
  const tier: FamilyRailTier = phone ? 'select' : wide ? 'rail' : 'toggle';

  // At the middle width the rail is a choice, and the choice is remembered.
  const [chosen, setChosen] = useState<boolean>(
    () => readBrowserText('durable', FAMILY_RAIL_KEY) !== 'closed'
  );
  const toggle = useCallback((): void => {
    setChosen((previous) => {
      writeBrowserText('durable', FAMILY_RAIL_KEY, previous ? 'closed' : 'open');
      return !previous;
    });
  }, []);

  // Opening a repository puts its family in scope for every page after it.
  const { carried, setFamily } = scope;
  useEffect(() => {
    if (canonical && !sameFamily(carried, canonical)) setFamily(canonical);
  }, [canonical, carried, setFamily]);

  const hrefFor = useCallback(
    (repo: RepositorySummary): string => familyMemberHref(repo, tab),
    [tab]
  );

  const move = useCallback(
    (step: -1 | 1): void => {
      const next = neighbourMember(members, repoId, step);
      if (next && next.id.id !== repoId) navigate(hrefFor(next));
    },
    [hrefFor, members, navigate, repoId]
  );

  useKeyboardShortcut('alt+arrowup', () => move(-1), {
    label: 'Previous repository in the family',
    group: 'Navigation',
    enabled: key !== '',
  });
  useKeyboardShortcut('alt+arrowdown', () => move(1), {
    label: 'Next repository in the family',
    group: 'Navigation',
    enabled: key !== '',
  });

  const rollup = useMemo(() => aggregateFamily(key, members), [key, members]);

  if (key === '') return null;
  return {
    family: key,
    label: formatFamilyName(key),
    tier,
    members,
    rollup,
    current: members.find((repo) => repo.id.id === repoId) ?? null,
    open: tier === 'rail' || (tier === 'toggle' && chosen),
    toggle,
    hrefFor,
  };
}

/** The rail: the family's rollup, then its member repositories. */
export function RepoFamilyRail({ rail }: { rail: FamilyRail }): JSX.Element {
  return (
    <aside
      id={FAMILY_RAIL_ID}
      className="repo-family-rail"
      aria-label={`${rail.label} family`}
      data-testid="repo-family-rail"
      hidden={!rail.open}
    >
      <div className="repo-family-rail__head">
        <span className="repo-family-rail__name">{rail.label}</span>
        <div className="repo-family-rail__rollup">
          <span className="repo-family-rail__fact">
            {rail.rollup.memberCount} repo{rail.rollup.memberCount === 1 ? '' : 's'}
          </span>
          <HealthDot health={rail.rollup.health} what={`${rail.label} family`} />
          <Link
            to={pullRoomFamilyHref(rail.family)}
            className="repo-family-rail__fact repo-family-rail__link"
            aria-label={`${rail.rollup.openPullRequests} open pull requests in flight`}
          >
            <GitMerge size={12} aria-hidden="true" /> {rail.rollup.openPullRequests} open
          </Link>
          <span
            className="repo-family-rail__fact"
            aria-label={`${rail.rollup.failingChecks} failing checks`}
          >
            <ShieldAlert size={12} aria-hidden="true" /> {rail.rollup.failingChecks} failing
          </span>
        </div>
      </div>

      <nav
        className="repo-family-rail__members"
        aria-label={`Repositories in ${rail.label}`}
      >
        {rail.members.map((repo) => (
          <Link
            key={repo.id.id}
            to={rail.hrefFor(repo)}
            className="repo-family-rail__member"
            data-testid={`repo-family-member-${repo.id.name}`}
            aria-current={repo.id.id === rail.current?.id.id ? 'page' : undefined}
          >
            <HealthDot health={repo.health} what={repo.id.name} />
            <span className="repo-family-rail__member-name">{repo.id.name}</span>
            <span
              className="repo-family-rail__member-pulls"
              aria-label={`${repo.id.name}: ${memberPullsLabel(repo.open_pull_requests)}`}
            >
              {repo.open_pull_requests}
            </span>
          </Link>
        ))}
      </nav>

      <FamilyAgents
        family={rail.family}
        host={rail.current?.id.host ?? rail.members[0]?.id.host ?? ''}
      />
    </aside>
  );
}

/**
 * The family's agents at work, live ones only. A server without the presence
 * route draws nothing here: the rail looks the way it did before.
 */
function FamilyAgents({ family, host }: { family: string; host: string }): JSX.Element | null {
  const view = presenceView(useFamilyAgentPresence(family));
  const now = useTickingNow();
  const shown = view.kind === 'ready' || view.kind === 'failed';
  const live = view.kind === 'ready' ? livePresenceCount(view.list.items) : 0;
  return shown ? (
    <section
      className="repo-family-rail__agents"
      aria-labelledby="family-agents-title"
      data-testid="family-agents"
    >
      <h3 className="repo-family-rail__agents-title" id="family-agents-title">
        Active agents
        {live > 0 ? (
          <span className="repo-family-rail__agents-count" data-testid="family-agents-count">
            {live}
          </span>
        ) : null}
      </h3>
      {view.kind === 'ready' ? (
        <CompactPresenceList items={view.list.items} host={host} now={now} />
      ) : (
        <p className="presence-compact__empty" data-testid="family-agents-error">
          Could not load the agents at work.
        </p>
      )}
    </section>
  ) : null;
}

/**
 * What the header carries: nothing at the full width, the rail's toggle at the
 * middle one, and a select on a phone, where there is no room for a rail.
 */
export function FamilyRailControl({ rail }: { rail: FamilyRail }): JSX.Element | null {
  const navigate = useNavigate();

  if (rail.tier === 'rail') return null;
  if (rail.tier === 'toggle') {
    return (
      <ActionButton
        variant="ghost"
        onClick={rail.toggle}
        aria-expanded={rail.open}
        aria-controls={FAMILY_RAIL_ID}
        data-testid="repo-family-rail-toggle"
        icon={
          rail.open ? (
            <PanelLeftClose size={14} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={14} aria-hidden="true" />
          )
        }
      >
        {rail.label}
      </ActionButton>
    );
  }

  return (
    <select
      className="repo-family-rail__select"
      data-testid="repo-family-select"
      aria-label={`Switch repo in ${rail.label}`}
      value={rail.current?.id.id ?? ''}
      onChange={(event) => {
        const next = rail.members.find((repo) => repo.id.id === event.target.value);
        if (next) navigate(rail.hrefFor(next));
      }}
    >
      {rail.current ? null : <option value="">Switch repo…</option>}
      {rail.members.map((repo) => (
        <option key={repo.id.id} value={repo.id.id}>
          {repo.id.name}
        </option>
      ))}
    </select>
  );
}

function HealthDot({ health, what }: { health: string; what: string }): JSX.Element {
  const known =
    health === 'healthy' || health === 'degraded' || health === 'failing' ? health : null;
  return (
    <span
      className={`repo-family-rail__dot${known ? ` repo-family-rail__dot--${known}` : ''}`}
      role="status"
      aria-label={`${what} health: ${health.replaceAll('_', ' ')}`}
    />
  );
}
