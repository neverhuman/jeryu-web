// fleet/RunnerNetwork.tsx — the rows of the /runners page. A row says four
// things: which runner, what it is doing now, what it did last, and when it was
// last heard from. Gate slots and PR reviewers (pr-redteam) share the shape and
// differ only in their words ("gating … passed" / "reviewing … approved"), so
// the two lists read the same way. Status, slots, in-flight, task-count and
// label columns are gone: for a one-slot runner they all said the same thing.
//
// A runner that reports its installed code carries it under its name
// ("runs abc1234 · 1.4.0"), marked "differs" when most of its peers on the same
// code repo run another commit. That is the runner's own scripts; what scores
// a pull request is the line beneath it ("evaluates with jankurai …", see
// RunnerEvaluates), amber when its scorer build is not its section's majority.
// Quality audit runners get the same rows in their own list. A runner a release board names gets a second
// line linking to that lane ("acme · Gate runner · installed v1.2.0"), and a
// row `?runners=` picked is highlighted; each row's id is `runner-<slug>`.

import { Link } from 'react-router-dom';

import { useForgeHost } from '../../hooks/useForgeHost';
import { pullHref } from '../activity/activityModel';
import { toneModifier } from '../../components/tone/tone';
import { repoRefOf, repoUrl } from '../repoBrowserModel';
import { When } from '../../format/When';
import {
  codeLabel,
  codeOutliers,
  codeTitle,
  rowLast,
  rowNow,
  runnerName,
  seenStale,
  type PullRef,
  type RowLast,
  type RunnerNetworkNode
} from '../runnerNetworkModel';
import { NO_PLACES, runnerAnchorId, type RunnerPlaces } from './releaseIndex';
import { RunnerReleaseLink } from './RunnerReleaseLink';
import { RunnerEvaluates } from './RunnerEvaluates';
import { scorerOutliers } from './runnerTools';

interface RowListProps {
  nodes: RunnerNetworkNode[];
  /** When the snapshot was fetched: "for 1m 20s" and "stale" measure against it. */
  nowMs: number;
  /** Each runner's release-board lane, and the rows `?runners=` picked. */
  places?: RunnerPlaces;
}

export function RunnerNodeList({ nodes, nowMs, places }: RowListProps): JSX.Element {
  return (
    <RowList
      nodes={nodes}
      nowMs={nowMs}
      places={places}
      label="Runner nodes"
      testId="fleet-node-list"
      rowTestId="fleet-node"
      heads={['Runner', 'Now', 'Last job', 'Seen']}
    />
  );
}

/** PR reviewers (pr-redteam): the agents that approve and merge pull requests. */
export function ReviewerList({
  reviewers,
  nowMs,
  places
}: {
  reviewers: RunnerNetworkNode[];
  nowMs: number;
  places?: RunnerPlaces;
}): JSX.Element {
  return (
    <RowList
      nodes={reviewers}
      nowMs={nowMs}
      places={places}
      label="Pull request reviewers"
      testId="fleet-reviewer-list"
      rowTestId="fleet-reviewer"
      heads={['Reviewer', 'Now', 'Last review', 'Seen']}
    />
  );
}

/** Quality audit runners: they score repositories with jankurai rather than gate them. */
export function AuditList({
  audits,
  nowMs,
  places
}: {
  audits: RunnerNetworkNode[];
  nowMs: number;
  places?: RunnerPlaces;
}): JSX.Element {
  return (
    <RowList
      nodes={audits}
      nowMs={nowMs}
      places={places}
      label="Quality audits"
      testId="fleet-audit-list"
      rowTestId="fleet-audit"
      heads={['Runner', 'Now', 'Last audit', 'Seen']}
    />
  );
}

function RowList({
  nodes,
  nowMs,
  places = NO_PLACES,
  label,
  testId,
  rowTestId,
  heads
}: RowListProps & {
  label: string;
  testId: string;
  rowTestId: string;
  heads: [string, string, string, string];
}): JSX.Element {
  const outliers = codeOutliers(nodes);
  const scorerDrift = scorerOutliers(nodes);
  return (
    <div
      className="fleet__node-list"
      data-testid={testId}
      role="list"
      aria-label={label}
    >
      <div
        className="fleet__node-row fleet__node-row--header"
        aria-hidden="true"
      >
        {heads.map((head) => (
          <span key={head}>{head}</span>
        ))}
      </div>
      {nodes.map((node) => (
        <RunnerRow
          key={node.runnerId}
          node={node}
          nowMs={nowMs}
          testId={rowTestId}
          heads={heads}
          codeDiffers={outliers.has(node.runnerId)}
          scorerDiffers={scorerDrift.has(node.runnerId)}
          places={places}
        />
      ))}
    </div>
  );
}

function RunnerRow({
  node,
  nowMs,
  testId,
  heads,
  codeDiffers,
  scorerDiffers,
  places
}: {
  node: RunnerNetworkNode;
  nowMs: number;
  testId: string;
  heads: [string, string, string, string];
  codeDiffers: boolean;
  scorerDiffers: boolean;
  places: RunnerPlaces;
}): JSX.Element {
  const nodeId = testIdSegment(node.runnerId);
  const release = places.releases.get(node.runnerId);
  const highlighted = places.highlighted.has(node.runnerId);
  const now = rowNow(node, nowMs);
  const last = rowLast(node);
  const stale = seenStale(node.lastUpdated, nowMs);
  return (
    <article
      id={runnerAnchorId(node.runnerId)}
      className={`fleet__node-item is-${node.availability} is-${node.activityState}${highlighted ? ' is-highlighted' : ''}${scorerDiffers ? ' is-tool-drift' : ''}`}
      aria-current={highlighted ? 'true' : undefined}
      data-testid={`${testId}-${nodeId}`}
      role="listitem"
      aria-label={`${runnerName(node.runnerId)}: ${now.text}`}
    >
      <div className="fleet__node-row">
        <div className="fleet__node-who">
          <h3
            className="fleet__node-title"
            title={`${node.runnerId} · ${node.source}`}
          >
            {runnerName(node.runnerId)}
          </h3>
          {node.code ? (
            <p
              className="fleet__node-code"
              data-testid={`${testId}-code-${nodeId}`}
              title={codeTitle(node.code)}
            >
              runs <code>{codeLabel(node.code)}</code>
              {codeDiffers ? (
                <>
                  {' '}
                  <span
                    className="fleet__tone--warn"
                    data-testid={`${testId}-code-differs-${nodeId}`}
                  >
                    · differs
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
          <RunnerEvaluates
            tools={node.tools ?? []}
            scorerDiffers={scorerDiffers}
            testId={`${testId}-tools-${nodeId}`}
          />
          {release ? (
            <RunnerReleaseLink
              release={release}
              codeVersion={node.code?.version}
              testId={`${testId}-release-${nodeId}`}
            />
          ) : null}
        </div>
        <p
          className={`fleet__node-now ${toneModifier('fleet__tone', now.tone)}`}
          data-label={heads[1]}
          data-testid={`${testId}-now-${nodeId}`}
        >
          {now.subject ? (
            <>
              {now.text}{' '}
              <NowSubject node={node} subject={now.subject} pull={now.pull} />
              {now.elapsed ? ` for ${now.elapsed}` : ''}
              {now.draining ? ' · draining' : ''}
            </>
          ) : (
            now.text
          )}
        </p>
        <p
          className="fleet__node-last"
          data-label={heads[2]}
          data-testid={`${testId}-last-${nodeId}`}
        >
          {last ? (
            <>
              {last.verbFirst ? (
                <>
                  <span className={toneModifier('fleet__tone', last.tone)}>
                    {last.verb}
                  </span>{' '}
                  <LastSubject last={last} />
                  {last.blocked ? (
                    <span
                      className="fleet__tone--warn"
                      data-testid={`${testId}-merge-blocked-${nodeId}`}
                    >
                      {' '}- merge blocked: {last.blocked}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <LastSubject last={last} />{' '}
                  <span className={toneModifier('fleet__tone', last.tone)}>
                    {last.verb}
                  </span>
                </>
              )}{' '}
              in {last.duration} ·{' '}
              <time dateTime={last.finishedAt} title={last.finishedAt}>
                <When at={last.finishedAt} />
              </time>
            </>
          ) : (
            <span className="fleet__node-muted">none yet</span>
          )}
        </p>
        <p className="fleet__node-seen" data-label={heads[3]}>
          {node.lastUpdated ? (
            <time
              className={stale ? 'fleet__tone--warn' : 'fleet__node-muted'}
              dateTime={node.lastUpdated}
              title={node.lastUpdated}
            >
              <When at={node.lastUpdated} />
            </time>
          ) : (
            <span className="fleet__tone--warn">never</span>
          )}
        </p>
      </div>
      {node.mergeGrantGaps?.length ? (
        <p
          className="fleet__node-last fleet__tone--warn"
          data-testid={`${testId}-merge-grant-${nodeId}`}
        >
          {node.mergeGrantGaps.map((gap) => gap.message).join(' · ')}
        </p>
      ) : null}
    </article>
  );
}

/** What is being worked on: the agent terminal when there is one, else the pull request. */
function NowSubject({
  node,
  subject,
  pull
}: {
  node: RunnerNetworkNode;
  subject: string;
  pull: PullRef | null;
}): JSX.Element {
  const forgeHost = useForgeHost();
  const task = node.tasks[0];
  const terminal = task ? taskTerminalPath(task, forgeHost(task.repo ?? undefined)) : undefined;
  const more = node.tasks.length - 1;
  const extra =
    more > 0 ? <span className="fleet__node-muted"> +{more}</span> : null;
  if (task && terminal) {
    return (
      <>
        <Link
          to={terminal}
          data-testid={`fleet-task-${testIdSegment(task.taskId)}`}
          title={task.lastTtyLine ?? 'TTY preview unavailable.'}
          aria-label={`Open terminal for ${subject}`}
        >
          {subject}
        </Link>
        {extra}
      </>
    );
  }
  if (pull) {
    return (
      <>
        <PullLink pull={pull} />
        {extra}
      </>
    );
  }
  return (
    <>
      <strong
        data-testid={
          task ? `fleet-task-${testIdSegment(task.taskId)}` : undefined
        }
        title={
          task ? (task.lastTtyLine ?? 'TTY preview unavailable.') : undefined
        }
      >
        {subject}
      </strong>
      {extra}
    </>
  );
}

/** Build the drill-down URL for a task that has both a repo and an agent run id. */
function taskTerminalPath(
  task: RunnerNetworkNode['tasks'][number],
  host: string
): string | undefined {
  if (!task.repo || !task.agentRunId) return;
  return repoUrl(repoRefOf(host, task.repo), 'agents', encodeURIComponent(task.agentRunId));
}

function testIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** The job's pull request as a link, or its `repo@sha` in plain text. */
function LastSubject({ last }: { last: RowLast }): JSX.Element {
  return last.pull ? <PullLink pull={last.pull} /> : <>{last.subject}</>;
}

/** `owner/name#pr`, linked to the pull request it names. */
function PullLink({ pull }: { pull: PullRef }): JSX.Element {
  const forgeHost = useForgeHost();
  return (
    <Link to={pullHref(forgeHost(pull.repo), pull.repo, pull.pr)}>
      {pull.repo}#{pull.pr}
    </Link>
  );
}
