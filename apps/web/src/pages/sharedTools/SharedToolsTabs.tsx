// SharedToolsTabs.tsx — the Findings → Proposals → Adoption strip shared by
// the three Shared tools pages. The order is the pipeline: the always-on
// scan finds duplicated code, an admin approves a proposed shared tool, and
// Adoption shows which repos actually use each tool.

import { NavLink } from 'react-router-dom';

import './SharedTools.css';

export const SHARED_TOOLS_PATH = '/shared-tools';
export const FINDINGS_PATH = `${SHARED_TOOLS_PATH}/findings`;
export const PROPOSALS_PATH = `${SHARED_TOOLS_PATH}/proposals`;
export const ADOPTION_PATH = `${SHARED_TOOLS_PATH}/adoption`;

const TABS = [
  { to: FINDINGS_PATH, label: 'Findings', hint: 'Duplicated code worth sharing' },
  { to: PROPOSALS_PATH, label: 'Proposals', hint: 'Approve or reject shared tools' },
  { to: ADOPTION_PATH, label: 'Adoption', hint: 'Which repos use each tool' },
] as const;

export function SharedToolsTabs(): JSX.Element {
  return (
    <nav className="shared-tools-tabs" aria-label="Shared tools">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          title={tab.hint}
          className={({ isActive }) =>
            `shared-tools-tabs__tab${isActive ? ' is-active' : ''}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
