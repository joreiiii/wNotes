import { create } from "zustand";
import { commands } from "../lib/tauri-commands";
import type { LibraryIndex } from "../types";

interface LibraryState {
  index: LibraryIndex;
  currentFolderId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setCurrentFolder: (folderId: string | null) => void;
  createFolder: (title: string) => Promise<void>;
  createNotebook: (title: string) => Promise<string>;
  renameFolder: (folderId: string, title: string) => Promise<void>;
  renameNotebook: (notebookId: string, title: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  deleteNotebook: (notebookId: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  index: { folders: [], notebooks: [] },
  currentFolderId: null,
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const index = await commands.getLibrary();
      set({ index, loading: false });
    } catch (err) {
      console.error("failed to load library", err);
      set({ loading: false });
    }
  },

  setCurrentFolder: (folderId) => set({ currentFolderId: folderId }),

  createFolder: async (title) => {
    await commands.createFolder(title, get().currentFolderId);
    await get().refresh();
  },

  createNotebook: async (title) => {
    const entry = await commands.createNotebook(title, get().currentFolderId);
    await get().refresh();
    return entry.id;
  },

  renameFolder: async (folderId, title) => {
    await commands.renameFolder(folderId, title);
    await get().refresh();
  },

  renameNotebook: async (notebookId, title) => {
    await commands.renameNotebook(notebookId, title);
    await get().refresh();
  },

  deleteFolder: async (folderId) => {
    await commands.deleteFolder(folderId);
    await get().refresh();
  },

  deleteNotebook: async (notebookId) => {
    await commands.deleteNotebook(notebookId);
    await get().refresh();
  },
}));
