import { invoke } from "@tauri-apps/api/core";
import type {
  FolderEntry,
  LibraryIndex,
  NotebookEntry,
  NotebookManifest,
  PageData,
} from "../types";

export const commands = {
  getLibrary: () => invoke<LibraryIndex>("get_library"),

  createFolder: (title: string, parentId: string | null) =>
    invoke<FolderEntry>("create_folder", { title, parentId }),
  renameFolder: (folderId: string, title: string) =>
    invoke<void>("rename_folder", { folderId, title }),
  deleteFolder: (folderId: string) => invoke<void>("delete_folder", { folderId }),

  createNotebook: (title: string, parentId: string | null) =>
    invoke<NotebookEntry>("create_notebook", { title, parentId }),
  renameNotebook: (notebookId: string, title: string) =>
    invoke<void>("rename_notebook", { notebookId, title }),
  deleteNotebook: (notebookId: string) => invoke<void>("delete_notebook", { notebookId }),

  getNotebookManifest: (notebookId: string) =>
    invoke<NotebookManifest>("get_notebook_manifest", { notebookId }),
  saveNotebookManifest: (manifest: NotebookManifest) =>
    invoke<void>("save_notebook_manifest", { manifest }),

  getPage: (notebookId: string, pageId: string) =>
    invoke<PageData>("get_page", { notebookId, pageId }),
  savePage: (notebookId: string, pageId: string, content: PageData) =>
    invoke<void>("save_page", { notebookId, pageId, content }),
  deletePage: (notebookId: string, pageId: string) =>
    invoke<void>("delete_page", { notebookId, pageId }),

  importAsset: (notebookId: string, fileName: string, bytes: Uint8Array) =>
    invoke<string>("import_asset", { notebookId, fileName, bytes: Array.from(bytes) }),
  readAsset: (notebookId: string, fileName: string) =>
    invoke<number[]>("read_asset", { notebookId, fileName }).then(
      (bytes) => new Uint8Array(bytes),
    ),

  saveThumbnail: (notebookId: string, pageId: string, bytes: Uint8Array) =>
    invoke<void>("save_thumbnail", { notebookId, pageId, bytes: Array.from(bytes) }),
  readThumbnail: (notebookId: string, pageId: string) =>
    invoke<number[]>("read_thumbnail", { notebookId, pageId }).then(
      (bytes) => new Uint8Array(bytes),
    ),
  hasThumbnail: (notebookId: string, pageId: string) =>
    invoke<boolean>("has_thumbnail", { notebookId, pageId }),
};
