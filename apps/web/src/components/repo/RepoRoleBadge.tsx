import { Globe, Puzzle, Wrench, type LucideIcon } from 'lucide-react';

import type { RepositorySummary } from '../../api/types';

import './repo.css';

type RepoRole = NonNullable<RepositorySummary['repo_role']>;

const ROLES: Record<
  RepoRole,
  { icon: LucideIcon; label: string; hint: string }
> = {
  public_portal: {
    icon: Globe,
    label: 'Public portal',
    hint: 'the family publishes from this repository'
  },
  tool_control_plane: {
    icon: Wrench,
    label: 'Tool control plane',
    hint: 'runs the family tooling; hosted beside the family, not split from it'
  },
  split_member: {
    icon: Puzzle,
    label: 'Split member',
    hint: 'one of the repositories split out of the family monorepo'
  }
};

/** Role icon for a split-family repository; the name and meaning on hover. */
export function RepoRoleBadge({
  role
}: {
  role: RepositorySummary['repo_role'];
}): JSX.Element | null {
  if (!role) return null;
  const { icon: Icon, label, hint } = ROLES[role];
  return (
    <span
      className={`repo-role-badge repo-role-badge--${role}`}
      role="img"
      aria-label={label}
      title={`${label}: ${hint}`}
    >
      <Icon aria-hidden="true" size={12} />
    </span>
  );
}
