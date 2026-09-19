// preferencesStore.ts — user UI preferences (W-FE-05 + W-CC-01).
//
// State persists through the audited browser storage adapter as
// `jeryu.preferences.v1`. The version suffix lets us migrate the schema later
// without poisoning user data.

import { create } from 'zustand';

import { readBrowserText, writeBrowserText } from '../storage/browserStorage';

export type ThemePreference = 'system' | 'light' | 'dark' | 'high-contrast';
export type KeyboardMode = 'default' | 'vim';
export type DateFormat = 'relative' | 'iso' | 'long';
export type DiffMode = 'unified' | 'split';

export interface PreferencesState {
  theme: ThemePreference;
  codeFontSize: number;
  dateFormat: DateFormat;
  keyboardMode: KeyboardMode;
  diffMode: DiffMode;
  setTheme: (theme: ThemePreference) => void;
  setCodeFontSize: (size: number) => void;
  setDateFormat: (format: DateFormat) => void;
  setKeyboardMode: (mode: KeyboardMode) => void;
  setDiffMode: (mode: DiffMode) => void;
  reset: () => void;
}

// v2: the TUI overhaul flips the default theme to the dark terminal surface.
// Bumping the version resets stored prefs so returning users land on the new
// default instead of a stale `system` (which could resolve to light).
const STORAGE_KEY = 'jeryu.preferences.v2';

const DEFAULTS: Pick<
  PreferencesState,
  | 'theme'
  | 'codeFontSize'
  | 'dateFormat'
  | 'keyboardMode'
  | 'diffMode'
> = {
  theme: 'dark',
  codeFontSize: 13,
  dateFormat: 'relative',
  keyboardMode: 'default',
  diffMode: 'unified',
};

function loadInitial(): typeof DEFAULTS {
  try {
    const raw = readBrowserText('durable', STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    const field = (key: keyof typeof DEFAULTS): unknown =>
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)[key]
        : undefined;
    const codeFontSize = field('codeFontSize');
    return {
      theme: validateTheme(field('theme')) ?? DEFAULTS.theme,
      codeFontSize:
        typeof codeFontSize === 'number' &&
        codeFontSize >= 10 &&
        codeFontSize <= 24
          ? codeFontSize
          : DEFAULTS.codeFontSize,
      dateFormat: validateDateFormat(field('dateFormat')) ?? DEFAULTS.dateFormat,
      keyboardMode:
        validateKeyboardMode(field('keyboardMode')) ?? DEFAULTS.keyboardMode,
      diffMode: validateDiffMode(field('diffMode')) ?? DEFAULTS.diffMode,
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(state: typeof DEFAULTS): void {
  writeBrowserText('durable', STORAGE_KEY, JSON.stringify(state));
}

function validateTheme(input: unknown): ThemePreference | null {
  return input === 'system' ||
    input === 'light' ||
    input === 'dark' ||
    input === 'high-contrast'
    ? input
    : null;
}

function validateDateFormat(input: unknown): DateFormat | undefined {
  return input === 'relative' || input === 'iso' || input === 'long'
    ? input
    : undefined;
}

function validateKeyboardMode(input: unknown): KeyboardMode | undefined {
  return input === 'default' || input === 'vim' ? input : undefined;
}

function validateDiffMode(input: unknown): DiffMode | undefined {
  return input === 'unified' || input === 'split' ? input : undefined;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => {
  const initial = loadInitial();
  return {
    ...initial,
    setTheme: (theme) => {
      set({ theme });
      persistFromState(get);
    },
    setCodeFontSize: (codeFontSize) => {
      set({ codeFontSize });
      persistFromState(get);
    },
    setDateFormat: (dateFormat) => {
      set({ dateFormat });
      persistFromState(get);
    },
    setKeyboardMode: (keyboardMode) => {
      set({ keyboardMode });
      persistFromState(get);
    },
    setDiffMode: (diffMode) => {
      set({ diffMode });
      persistFromState(get);
    },
    reset: () => {
      set(DEFAULTS);
      persist(DEFAULTS);
    },
  };
});

function persistFromState(get: () => PreferencesState): void {
  const s = get();
  persist({
    theme: s.theme,
    codeFontSize: s.codeFontSize,
    dateFormat: s.dateFormat,
    keyboardMode: s.keyboardMode,
    diffMode: s.diffMode,
  });
}
