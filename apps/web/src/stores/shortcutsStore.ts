// shortcutsStore.ts — whether the keyboard-shortcuts overlay is open.
//
// A store rather than state inside the overlay: `?` opens it, and so does the
// palette's "Keyboard shortcuts" entry, which runs from outside the overlay.

import { create } from 'zustand';

export interface ShortcutsState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useShortcutsStore = create<ShortcutsState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
