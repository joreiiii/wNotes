import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

export interface OpenTab {
  id: string;
  notebookId: string;
  title: string;
  activePageId: string | null;
}

interface TabsState {
  tabs: OpenTab[];
  activeTabId: string | null;
  openNotebook: (notebookId: string, title: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setTabPage: (tabId: string, pageId: string) => void;
  renameTab: (notebookId: string, title: string) => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openNotebook: (notebookId, title) => {
    const existing = get().tabs.find((t) => t.notebookId === notebookId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const tab: OpenTab = { id: uuidv4(), notebookId, title, activePageId: null };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  closeTab: (tabId) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return s;
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === tabId) {
        const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
        activeTabId = neighbor ? neighbor.id : null;
      }
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  setTabPage: (tabId, pageId) => {
    const current = get().tabs.find((t) => t.id === tabId);
    if (!current || current.activePageId === pageId) return;
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activePageId: pageId } : t)),
    }));
  },

  renameTab: (notebookId, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.notebookId === notebookId ? { ...t, title } : t)),
    }));
  },
}));
