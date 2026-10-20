// BoardLanes.tsx — one lane per deliverable. When the board declares its
// columns (main, dev, stage, prod…) every lane sits on the same grid under one
// header row: a cell per column, holding the lane's stages there or a dashed
// "not used". Without columns a lane is a free track of stage cells (→ when a
// stage follows the previous one, ‖ when it runs beside it). Either way a
// never-deployed stage is dashed, lanes sharing a group sit under its name,
// and pressing a cell opens its detail under the lane.
//
// Delta first: a cell leads with how far the stage is from the lane's source
// ("30 behind main"), and the line under the lane head gives each step's gap
// ("stage → prod: 30 changes"). Homogeneity second: the cell's last line says
// whether every target agrees, and the detail opens on that verdict, the
// targets grouped by what they run, then every target, what promoting would
// ship, the rollback, and the promote command to copy. One cell per lane is open at a time; pressing it again closes it.
// Each lane is the anchor `#lane-<id>`, and a target that names its runners
// links to them on /runners ("2 runners"); one run by an external worker pool
// names its shift slots instead and links to them on /work ("2 workers").

import { useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { EnvironmentSummary } from '../../api/types/deployments';
import type {
  BoardColumn,
  BoardLane,
  BoardStage,
  ReleaseBoard,
} from '../../api/types/releaseBoard';
import { pillClass as tonePillClass } from '../../components/tone/tone';
import { CopyCommand } from '../../components/shellCommand/CopyCommand';
import { useViewState } from '../../hooks/useViewState';
import {
  laneAnchorId,
  runnerCountLabel,
  runnersHref,
  slotCountLabel,
  slotsHref,
  slotsTitle,
} from './links';
import {
  boardColumns,
  connectorLabel,
  homogeneityText,
  knownByText,
  laneGroups,
  laneLayout,
  noPromoteText,
  NOT_USED_TEXT,
  openStageId,
  pillClass,
  promoteWho,
  stageCellClass,
  stageConnector,
  stageDelta,
  stageOverlay,
  stageSkewed,
  stageTargets,
  stateTone,
  stepDeltas,
  stepDeltaText,
  targetStateText,
  withOpenStage,
  type StageOverlay,
} from './model';
import { When } from '../../format/When';
import { StageChanges } from './StageChanges';

export function BoardLanes({
  board,
  environments,
}: {
  board: ReleaseBoard;
  environments: ReadonlyMap<string, EnvironmentSummary[]>;
}): JSX.Element {
  const columns = boardColumns(board);
  return (
    <div className="release-board__lanes">
      {columns.length > 0 ? <ColumnHeader columns={columns} /> : null}
      {laneGroups(board.lanes).map((group) => {
        const lanes = group.lanes.map((lane) => (
          <LaneView
            key={lane.id}
            lane={lane}
            board={board}
            columns={columns}
            environments={environments}
          />
        ));
        return group.name === null ? (
          lanes
        ) : (
          <div
            key={`group-${group.lanes[0]?.id ?? group.name}`}
            className="release-board__group"
            role="group"
            aria-label={group.name}
            data-testid={`release-board-group-${group.name}`}
          >
            <p className="release-board__group-name">{group.name}</p>
            {lanes}
          </div>
        );
      })}
    </div>
  );
}

/** Column names once above every lane; each cell also names its column for narrow screens. */
function ColumnHeader({ columns }: { columns: readonly BoardColumn[] }): JSX.Element {
  return (
    <div
      className="release-board__grid release-board__column-head"
      style={gridStyle(columns.length)}
      aria-hidden="true"
      data-testid="release-board-columns"
    >
      {columns.map((column) => (
        <span key={column.id} className="release-board__column-name">
          {column.name}
        </span>
      ))}
    </div>
  );
}

function gridStyle(count: number): { gridTemplateColumns: string } {
  return { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };
}

function LaneView({
  lane,
  board,
  columns,
  environments,
}: {
  lane: BoardLane;
  board: ReleaseBoard;
  columns: readonly BoardColumn[];
  environments: ReadonlyMap<string, EnvironmentSummary[]>;
}): JSX.Element {
  // Which cell is open is in the URL (`?stage=<lane>:<stage>`), so the board
  // under an open detail panel can be linked; opening one pushes history.
  const view = useViewState();
  const entries = view.readList('stage');
  const openId = openStageId(entries, lane.id);
  const headingId = useId();
  const detailId = useId();
  const overlays = new Map<string, StageOverlay>();
  for (const stage of lane.stages) {
    const envs = stage.forge ? environments.get(stage.forge.repo) : undefined;
    const overlay = stageOverlay(stage, board.observed_at, envs);
    if (overlay) overlays.set(stage.id, overlay);
  }
  const open = lane.stages.find((stage) => stage.id === openId) ?? null;
  const cellFor = (stage: BoardStage): JSX.Element => (
    <StageCell
      key={stage.id}
      lane={lane}
      stage={stage}
      overlay={overlays.get(stage.id) ?? null}
      open={openId === stage.id}
      controls={detailId}
      onToggle={() =>
        view.write(
          { stage: withOpenStage(entries, lane.id, openId === stage.id ? null : stage.id) },
          'push',
          { preventScrollReset: true }
        )
      }
    />
  );

  return (
    <section
      id={laneAnchorId(lane.id)}
      className="release-board__lane"
      aria-labelledby={headingId}
      data-testid={`release-board-lane-${lane.id}`}
    >
      <div className="release-board__lane-head">
        <h3 className="release-board__lane-name" id={headingId}>
          {lane.name}
        </h3>
        {lane.read_only ? (
          <span className="page__pill" data-testid={`release-board-read-only-${lane.id}`}>
            read-only here · owned by {lane.owner_family}
          </span>
        ) : null}
        <span className="release-board__muted">{lane.source}</span>
      </div>
      <StepStrip lane={lane} />
      {columns.length > 0 ? (
        <ColumnTrack
          lane={lane}
          columns={columns}
          renderCell={cellFor}
        />
      ) : (
        <ol className="release-board__track" aria-label={`${lane.name} stages, in order`}>
          {lane.stages.map((stage, index) => {
            const connector = stageConnector(stage, index);
            return (
              <li key={stage.id} className="release-board__step">
                {connector ? (
                  <span
                    className={`release-board__connector${connector === '‖' ? ' release-board__connector--parallel' : ''}`}
                  >
                    <span aria-hidden="true">{connector}</span>
                    <span className="sr-only">{connectorLabel(connector)}</span>
                  </span>
                ) : null}
                {cellFor(stage)}
              </li>
            );
          })}
        </ol>
      )}
      <div id={detailId} data-testid={`release-board-detail-${lane.id}`}>
        {open ? (
          <StageDetail lane={lane} stage={open} overlay={overlays.get(open.id) ?? null} />
        ) : null}
      </div>
    </section>
  );
}

/** The gap between each stage and the one it is promoted from, in one line. */
function StepStrip({ lane }: { lane: BoardLane }): JSX.Element | null {
  const steps = stepDeltas(lane);
  if (steps.length === 0) return null;
  return (
    <ol
      className="release-board__steps"
      aria-label={`${lane.name}: changes between stages`}
      data-testid={`release-board-steps-${lane.id}`}
    >
      {steps.map((step) => (
        <li
          key={`${step.from}-${step.to}`}
          className={`release-board__step-delta${step.count === 0 ? '' : ' release-board__step-delta--gap'}`}
        >
          {step.from} → {step.to}: <strong>{stepDeltaText(step)}</strong>
        </li>
      ))}
    </ol>
  );
}

/** A lane on the board's grid: one cell per column, then any stage placed in no column. */
function ColumnTrack({
  lane,
  columns,
  renderCell,
}: {
  lane: BoardLane;
  columns: readonly BoardColumn[];
  renderCell: (stage: BoardStage) => JSX.Element;
}): JSX.Element {
  const layout = laneLayout(lane, columns);
  return (
    <>
      <ol
        className="release-board__grid"
        style={gridStyle(columns.length)}
        aria-label={`${lane.name} by stage`}
      >
        {layout.cells.map(({ column, stages }) => (
          <li
            key={column.id}
            className="release-board__slot"
            aria-label={column.name}
            data-testid={`release-board-slot-${lane.id}-${column.id}`}
          >
            <span className="release-board__slot-name" aria-hidden="true">
              {column.name}
            </span>
            {stages.length > 0 ? (
              stages.map(renderCell)
            ) : (
              <span className="release-board__cell release-board__cell--not-used">
                {NOT_USED_TEXT}
              </span>
            )}
          </li>
        ))}
      </ol>
      {layout.unplaced.length > 0 ? (
        <div className="release-board__unplaced" aria-label={`${lane.name}, other stages`}>
          <span className="release-board__muted">other stages</span>
          {layout.unplaced.map(renderCell)}
        </div>
      ) : null}
    </>
  );
}

function StageCell({
  lane,
  stage,
  overlay,
  open,
  controls,
  onToggle,
}: {
  lane: BoardLane;
  stage: BoardStage;
  overlay: StageOverlay | null;
  open: boolean;
  controls: string;
  onToggle: () => void;
}): JSX.Element {
  const version = overlay ? overlay.version : (stage.version ?? 'unknown');
  const delta = stageDelta(stage);
  const targets = stageTargets(stage);
  // Skew is red with the alert icon wherever it is said: in the collector's
  // status when that is what the cell leads with, and on the targets line.
  const skewed = stageSkewed(stage);
  const skewInDelta = skewed && delta.text === stage.status;
  return (
    <button
      type="button"
      className={stageCellClass(stage, open)}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      data-testid={`release-board-stage-${lane.id}-${stage.id}`}
    >
      <span className="release-board__stage-name">{stage.name}</span>
      <span className="release-board__version">{version}</span>
      <span>
        <span
          className={skewInDelta ? `${tonePillClass('human')} release-board__skew` : pillClass(delta.state)}
          data-testid="release-board-delta"
          data-skew={skewInDelta ? 'true' : undefined}
        >
          {skewInDelta ? <AlertTriangle aria-hidden="true" size={12} /> : null}
          {delta.text}
        </span>
      </span>
      {targets ? (
        <span
          className={`release-board__targets release-board__targets--${skewed && targets.differ > 0 ? 'human' : stateTone(targets.state)}`}
          data-testid="release-board-targets"
        >
          {skewed && targets.differ > 0 ? <AlertTriangle aria-hidden="true" size={12} /> : null}
          {targets.text}
        </span>
      ) : null}
      {overlay ? (
        <span className="release-board__overlay" data-testid="release-board-overlay">
          {overlay.note}
        </span>
      ) : null}
    </button>
  );
}

function StageDetail({
  lane,
  stage,
  overlay,
}: {
  lane: BoardLane;
  stage: BoardStage;
  overlay: StageOverlay | null;
}): JSX.Element {
  const targets = stageTargets(stage);
  const knownBy = overlay ? overlay.knownBy : stage.known_by;
  return (
    <div className="release-board__detail" data-testid="release-board-stage-detail">
      <h4 className="release-board__detail-title">
        {lane.name} · {stage.name}
      </h4>
      {targets ? (
        <div className="release-board__homogeneity" data-testid="release-board-homogeneity">
          <p className={`release-board__verdict release-board__targets--${stateTone(targets.state)}`}>
            {homogeneityText(targets)}
          </p>
          {targets.builds.length > 1 ? (
            <ul className="release-board__list">
              {targets.builds.map((build) => (
                <li key={build.running}>
                  <code>{build.running}</code> on {build.count} target{build.count === 1 ? '' : 's'}{' '}
                  <span className={pillClass(build.state)}>{targetStateText(build.state)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="release-board__muted">No targets reported for this stage.</p>
      )}
      <p className="release-board__known">
        {stage.status === 'source' ? null : <>Collector status <strong>{stage.status}</strong> · </>}
        known by <strong>{knownByText(knownBy)}</strong>
      </p>
      {overlay ? (
        <p className="release-board__muted">
          The forge reported <code>{overlay.version}</code> at{' '}
          <When at={overlay.reportedAt} />, after this snapshot
          was observed. The snapshot showed <code>{stage.version ?? 'nothing'}</code>; targets
          below are from the snapshot.
        </p>
      ) : null}
      {stage.targets.length > 0 ? (
        <div className="table-scroll">
          <table className="release-board__table">
            <caption className="sr-only">Targets of {stage.name}</caption>
            <thead>
              <tr>
                <th scope="col">Target</th>
                <th scope="col">Running</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {stage.targets.map((target, index) => (
                <tr key={`${index}-${target.name}`}>
                  <th scope="row">
                    {target.name}
                    {target.runners && target.runners.length > 0 ? (
                      <Link
                        className="release-board__runners"
                        to={runnersHref(target.runners)}
                        title={target.runners.join(', ')}
                        data-testid="release-board-target-runners"
                      >
                        {runnerCountLabel(target.runners.length)}
                      </Link>
                    ) : null}
                    {target.slots && target.slots.length > 0 ? (
                      <Link
                        className="release-board__runners"
                        to={slotsHref(target.slots)}
                        title={slotsTitle(target.slots)}
                        data-testid="release-board-target-slots"
                      >
                        {slotCountLabel(target.slots.length)}
                      </Link>
                    ) : null}
                  </th>
                  <td>
                    <code>{target.running ?? 'unknown'}</code>
                  </td>
                  <td>
                    <span className={pillClass(target.state)}>{targetStateText(target.state)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <StageChanges stageName={stage.name} missing={stage.missing} arrived={stage.arrived} />
      {/* `missing` says the same with todos and links; an older collector sends only `ships`. */}
      {stage.ships && !stage.missing ? (
        <div className="release-board__ships">
          <p className="release-board__label">
            {stage.ships.length > 0
              ? 'Promoting ships'
              : 'Nothing to ship: this stage already runs what would be promoted'}
          </p>
          {stage.ships.length > 0 ? (
            <ul className="release-board__list">
              {stage.ships.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {stage.rollback ? (
        <p className="release-board__muted">
          <strong>Rollback:</strong> {stage.rollback}
        </p>
      ) : null}
      {stage.promote ? (
        <div className="release-board__promote">
          <p className="release-board__label">Promote</p>
          <p className="release-board__muted">{promoteWho(stage.promote)}</p>
          <CopyCommand
            command={stage.promote.command}
            label={`promote command for ${lane.name} ${stage.name}`}
          />
        </div>
      ) : (
        <p className="release-board__muted">{noPromoteText(stage)}</p>
      )}
    </div>
  );
}
