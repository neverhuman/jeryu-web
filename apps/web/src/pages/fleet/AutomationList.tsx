// fleet/AutomationList.tsx — the "Automation" rows of /runners: the forge's
// background timers (auto-pin, auto-stage). One compact row each: which timer,
// on which host, what it last did, and when it was last heard from. A timer
// that stopped reporting reads as a problem and says since when. No buttons;
// at most the one pull request link.

import { Link } from 'react-router-dom';

import { useForgeHost } from '../../hooks/useForgeHost';
import { pullHref } from '../activity/activityModel';
import { relativeTime } from '../../components/repo/relativeTime';
import type { RunnerNetworkNode } from '../runnerNetworkModel';
import { NO_PLACES, runnerAnchorId, type RunnerPlaces } from './releaseIndex';
import { RunnerReleaseLink } from './RunnerReleaseLink';
import {
  automationDid,
  automationHost,
  automationName,
  automationOffline
} from './automationModel';

const HEADS = ['Timer', 'Host', 'Last did', 'Seen'] as const;

export function AutomationList({
  timers,
  nowMs,
  places = NO_PLACES
}: {
  timers: RunnerNetworkNode[];
  /** When the snapshot was fetched: "offline" measures against it. */
  nowMs: number;
  /** Each timer's release-board lane, and the rows `?runners=` picked. */
  places?: RunnerPlaces;
}): JSX.Element {
  return (
    <div
      className="fleet__node-list"
      data-testid="fleet-automation-list"
      role="list"
      aria-label="Automation"
    >
      <div
        className="fleet__node-row fleet__node-row--header"
        aria-hidden="true"
      >
        {HEADS.map((head) => (
          <span key={head}>{head}</span>
        ))}
      </div>
      {timers.map((timer) => (
        <AutomationRow
          key={timer.runnerId}
          timer={timer}
          nowMs={nowMs}
          places={places}
        />
      ))}
    </div>
  );
}

function AutomationRow({
  timer,
  nowMs,
  places
}: {
  timer: RunnerNetworkNode;
  nowMs: number;
  places: RunnerPlaces;
}): JSX.Element {
  const forgeHost = useForgeHost();
  const id = timer.runnerId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const name = automationName(timer);
  const offline = automationOffline(timer, nowMs);
  const did = automationDid(timer);
  const release = places.releases.get(timer.runnerId);
  const highlighted = places.highlighted.has(timer.runnerId);
  return (
    <article
      id={runnerAnchorId(timer.runnerId)}
      className={`fleet__node-item is-${offline ? 'offline' : 'online'}${highlighted ? ' is-highlighted' : ''}`}
      aria-current={highlighted ? 'true' : undefined}
      data-testid={`fleet-automation-${id}`}
      role="listitem"
      aria-label={`${name}: ${offline ? 'offline' : 'reporting'}`}
    >
      <div className="fleet__node-row">
        <div className="fleet__node-who">
          <h3 className="fleet__node-title" title={timer.runnerId}>
            {name}
          </h3>
          {release ? (
            <RunnerReleaseLink
              release={release}
              codeVersion={timer.code?.version}
              testId={`fleet-automation-release-${id}`}
            />
          ) : null}
        </div>
        <p className="fleet__node-muted" data-label={HEADS[1]}>
          {automationHost(timer)}
        </p>
        <p
          className="fleet__node-last"
          data-label={HEADS[2]}
          data-testid={`fleet-automation-did-${id}`}
        >
          {did ? (
            <>
              <span className={`fleet__tone--${did.tone}`}>
                {did.before}
                {did.pull && did.link ? (
                  <Link to={pullHref(forgeHost(did.pull.repo), did.pull.repo, did.pull.pr)}>
                    {did.link}
                  </Link>
                ) : null}
                {did.after}
              </span>{' '}
              ·{' '}
              <time dateTime={did.finishedAt} title={did.finishedAt}>
                {relativeTime(did.finishedAt)}
              </time>
            </>
          ) : (
            <span className="fleet__node-muted">nothing yet</span>
          )}
        </p>
        <p
          className="fleet__node-seen"
          data-label={HEADS[3]}
          data-testid={`fleet-automation-seen-${id}`}
        >
          {timer.lastUpdated ? (
            <span
              className={offline ? 'fleet__tone--danger' : 'fleet__node-muted'}
            >
              {offline ? 'offline, last seen ' : ''}
              <time dateTime={timer.lastUpdated} title={timer.lastUpdated}>
                {relativeTime(timer.lastUpdated)}
              </time>
            </span>
          ) : (
            <span className="fleet__tone--danger">offline, never seen</span>
          )}
        </p>
      </div>
    </article>
  );
}
