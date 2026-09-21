import './repo.css';

/** "Archived" pill for a read-only repository; nothing when it is not. */
export function RepoArchivedBadge({
  archived,
}: {
  archived: boolean | undefined;
}): JSX.Element | null {
  if (!archived) return null;
  return (
    <span
      className="repo-archived-badge"
      title="Read-only: pushes, pull requests and merges are refused"
    >
      Archived
    </span>
  );
}
