// RepoArchiveSection.tsx — archive / unarchive one repository.
//
// Rendered in the repository's Settings directly above the danger zone. One
// button whose label follows the current state, one sentence saying what it
// does, and a confirm step that names the repository. Archiving is reversible
// and deletes nothing, so it lives outside the danger zone. The server allows
// it for global admins only; a refusal is surfaced inside the dialog.

import { useState } from 'react';

import type { RepositorySummary } from '../../api/types';
import { ActionButton } from '../action/ActionButton';
import { ActionPreviewDialog } from '../action/ActionPreviewDialog';
import { useArchiveRepository } from '../../hooks/useArchiveRepository';

import './repo.css';

const ARCHIVE_ACTION_ID = 'repo.archive';
const UNARCHIVE_ACTION_ID = 'repo.unarchive';

export interface RepoArchiveSectionProps {
  repo: RepositorySummary;
}

export function RepoArchiveSection({
  repo,
}: RepoArchiveSectionProps): JSX.Element {
  const fullName = `${repo.id.owner}/${repo.id.name}`;
  const archived = repo.archived === true;
  const [confirming, setConfirming] = useState(false);
  const mutation = useArchiveRepository(repo.id.id);

  const label = archived ? 'Unarchive' : 'Archive this repository';
  const sentence = archived
    ? `${fullName} is archived: it is read-only. Unarchiving makes it writable again; nothing was deleted.`
    : `Archiving makes ${fullName} read-only: it still reads and clones, but pushes, pull requests and merges are refused. Nothing is deleted and you can unarchive it at any time.`;

  return (
    <section
      className="repo-archive-section"
      aria-label="Archive"
      data-testid="repo-archive-section"
    >
      <h2 className="repo-archive-section__title">Archive</h2>
      <div className="repo-danger-zone__row">
        <p className="repo-danger-zone__row-detail">{sentence}</p>
        <ActionButton
          actionId={archived ? UNARCHIVE_ACTION_ID : ARCHIVE_ACTION_ID}
          onClick={() => {
            mutation.reset();
            setConfirming(true);
          }}
        >
          {label}
        </ActionButton>
      </div>
      <ActionPreviewDialog
        open={confirming}
        title={archived ? `Unarchive ${fullName}` : `Archive ${fullName}`}
        description={
          archived
            ? `${fullName} becomes writable again: pushes, pull requests and merges are accepted.`
            : `${fullName} becomes read-only. Nothing is deleted; you can unarchive it later.`
        }
        onConfirm={() =>
          mutation.mutate(!archived, {
            onSuccess: () => setConfirming(false),
          })
        }
        onCancel={() => setConfirming(false)}
        confirmLabel={archived ? `Unarchive ${fullName}` : `Archive ${fullName}`}
        confirmDisabled={mutation.isPending}
      >
        {mutation.error ? (
          <div className="delete-repo-dialog__error" role="alert">
            {mutation.error.message}
          </div>
        ) : null}
      </ActionPreviewDialog>
    </section>
  );
}
