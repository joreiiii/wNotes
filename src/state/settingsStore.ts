import { create } from "zustand";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "wnotes.theme";

function readStoredTheme(): ThemePreference {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "system" || raw === "light" || raw === "dark") return raw;
  return "dark";
}

interface SettingsState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    window.localStorage.setItem(STORAGE_KEY, theme);
    set({ theme });
  },
}));
