// repositorySettingsModel.ts — which Settings sections exist, and their names.
//
// Settings shows only what the forge serves: the repository facts the list
// endpoint already carries, the branch rule, the mirror, the grants, and the
// actions that archive or remove the repository. There is no settings API to
// edit, so every section is a read of live state plus the danger zone.

/** The sections, in left-nav order. The URL is `/settings/<id>`. */
export const SETTINGS_SECTIONS = [
  'general',
  'branch-protection',
  'mirror',
  'access',
  'danger-zone',
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

const SECTION_TITLES: Record<SettingsSectionId, string> = {
  general: 'General',
  'branch-protection': 'Branch protection',
  mirror: 'Mirror',
  access: 'Access',
  'danger-zone': 'Danger zone',
};

/** A URL segment as a section: anything unknown is General. */
export function normalizeSection(section: string | undefined): SettingsSectionId {
  const found = SETTINGS_SECTIONS.find((id) => id === section);
  return found ?? 'general';
}

export function sectionTitleFor(section: SettingsSectionId): string {
  return SECTION_TITLES[section];
}
