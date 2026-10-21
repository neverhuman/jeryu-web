// PromoteRun.tsx — the board's Promote control for one stage. The forge says
// whether it may run (`promote.run`): with no live release poller, an unstaged
// release or an ask already open it is disabled with that reason instead of
// queueing. Pressing it asks for confirmation (the forge's confirm text names
// the release and the target) and then queues the deploy; the stage's cell and
// this panel show the ask's state, and its log opens from the log link.

import { useState } from 'react';

import type {
  BoardLane,
  BoardPromoteRun,
  BoardStage
} from '../../api/types/releaseBoard';
import { ActionButton } from '../../components/action/ActionButton';
import { ActionPreviewDialog } from '../../components/action/ActionPreviewDialog';
import { When } from '../../format/When';
import { usePromoteStage } from '../../hooks/usePromoteStage';
import { promoteActionText } from './model';

export function PromoteRun({
  family,
  lane,
  stage,
  run
}: {
  family: string;
  lane: BoardLane;
  stage: BoardStage;
  run: BoardPromoteRun;
}): JSX.Element {
  const promote = usePromoteStage();
  const [confirming, setConfirming] = useState(false);
  const action = run.action;
  return (
    <div className="release-board__run" data-testid="release-board-promote-run">
      <ActionButton
        variant="primary"
        disabled={!run.available || promote.isPending}
        aria-label={`Promote ${lane.name} ${stage.name}`}
        onClick={() => {
          promote.reset();
          setConfirming(true);
        }}
      >
        Promote
      </ActionButton>
      {!run.available && run.reason ? (
        <p
          className="release-board__muted"
          data-testid="release-board-promote-reason"
        >
          {run.reason}
        </p>
      ) : null}
      {action ? (
        <p
          className="release-board__muted"
          data-testid="release-board-promote-action"
        >
          <strong>{promoteActionText(action.state)}</strong> · asked by{' '}
          {action.requested_by} <When at={action.requested_at} />
          {action.message ? <> · {action.message}</> : null} ·{' '}
          <a href={action.log_href} target="_blank" rel="noreferrer">
            log
          </a>
        </p>
      ) : null}
      {promote.error ? (
        <p className="release-board__muted" role="alert">
          {promote.error.message}
        </p>
      ) : null}
      <ActionPreviewDialog
        open={confirming}
        title={`Promote ${lane.name} ${stage.name}?`}
        description={run.confirm}
        confirmLabel="Promote"
        confirmDisabled={promote.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          promote.mutate({ family, lane: lane.id, stage: stage.id });
        }}
      />
    </div>
  );
}
