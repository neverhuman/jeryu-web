// SettingsLayout.tsx — left-nav + main content shell for Settings.
//
// The sections come from the page, which knows which ones the forge can
// answer. The active section is driven by the URL so the layout itself is
// stateless.

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { toneModifier } from '../tone/tone';

import './settings.css';

export interface SettingsNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** When true the item is rendered with the danger-zone treatment. */
  danger?: boolean;
}

export interface SettingsLayoutProps {
  /** The sections to list, in nav order. */
  sections: readonly SettingsNavItem[];
  activeSection: string;
  /** Builds the URL for a section. Allows the parent to keep router concerns. */
  hrefFor: (section: string) => string;
  /** Render-prop link wrapper (React Router `<Link>`). */
  renderLink: (props: {
    section: SettingsNavItem;
    href: string;
    active: boolean;
    children: ReactNode;
  }) => ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsLayout({
  sections,
  activeSection,
  hrefFor,
  renderLink,
  children,
  className,
}: SettingsLayoutProps): JSX.Element {
  return (
    <div
      className={`settings-layout ${className ?? ''}`.trim()}
      data-section={activeSection}
    >
      <nav className="settings-layout__nav" aria-label="Repository settings">
        <ul className="settings-layout__nav-list">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = section.id === activeSection;
            const href = hrefFor(section.id);
            const content = (
              <>
                <Icon aria-hidden="true" size={14} />
                <span>{section.label}</span>
              </>
            );
            return (
              <li
                key={section.id}
                className={`settings-layout__nav-item ${
                  section.danger ? toneModifier('settings-layout__nav-item', 'human') : ''
                } ${active ? 'settings-layout__nav-item--active' : ''}`.trim()}
              >
                {renderLink({ section, href, active, children: content })}
              </li>
            );
          })}
        </ul>
      </nav>
      <section className="settings-layout__main">{children}</section>
    </div>
  );
}
