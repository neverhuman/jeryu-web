import { Globe, Wrench, type LucideIcon } from 'lucide-react';

import type { RepositorySummary } from '../../api/types';

import './repo.css';

// A split member is what nearly every repository in a family is, so it is
// not marked: only the repositories that differ get an icon.
type MarkedRole = Exclude<
  NonNullable<RepositorySummary['repo_role']>,
  'split_member'
>;

const ROLES: Record<
  MarkedRole,
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
  }
};

/** Role icon for a family's portal or tool repository; the name and meaning on hover. */
export function RepoRoleBadge({
  role
}: {
  role: RepositorySummary['repo_role'];
}): JSX.Element | null {
  if (!role || role === 'split_member') return null;
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
