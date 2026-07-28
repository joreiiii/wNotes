import { useEffect } from "react";
import { Folder, FolderPlus, NotebookPen, Plus } from "lucide-react";
import { useLibraryStore } from "../state/libraryStore";

export interface HomeViewProps {
  onOpenNotebook: (notebookId: string, title: string) => void;
}

export default function HomeView({ onOpenNotebook }: HomeViewProps) {
  const { index, currentFolderId, loading, refresh, setCurrentFolder, createFolder, createNotebook, renameFolder, renameNotebook, deleteFolder, deleteNotebook } =
    useLibraryStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const folders = index.folders.filter((f) => f.parentId === currentFolderId);
  const notebooks = index.notebooks.filter((n) => n.parentId === currentFolderId);
  const currentFolder = index.folders.find((f) => f.id === currentFolderId) ?? null;
  const notebookCount = (folderId: string) => index.notebooks.filter((n) => n.parentId === folderId).length;

  return (
    <div className="home-view">
      <div className="home-header">
        {currentFolder ? (
          <button className="tool-btn" onClick={() => setCurrentFolder(currentFolder.parentId)}>
            ← {currentFolder.title}
          </button>
        ) : (
          <h1>wNotes</h1>
        )}
        <div className="toolbar-spacer" />
        <button
          className="tool-btn"
          onClick={async () => {
            const title = window.prompt("Ordnername");
            if (title) await createFolder(title);
          }}
        >
          <FolderPlus size={16} /> Ordner
        </button>
        <button
          className="tool-btn"
          onClick={async () => {
            const title = window.prompt("Notizbuchname", "Neues Notizbuch") ?? "Neues Notizbuch";
            const id = await createNotebook(title);
            onOpenNotebook(id, title);
          }}
        >
          <Plus size={16} /> Notizbuch
        </button>
      </div>

      {loading && <p className="hint">Lade Bibliothek…</p>}

      <div className="home-grid">
        {folders.map((f) => (
          <button
            key={f.id}
            className="home-item"
            onClick={() => setCurrentFolder(f.id)}
            onContextMenu={async (e) => {
              e.preventDefault();
              const action = window.prompt("umbenennen (u) oder löschen (l)?");
              if (action === "u") {
                const title = window.prompt("Neuer Name", f.title);
                if (title) await renameFolder(f.id, title);
              } else if (action === "l") {
                await deleteFolder(f.id);
              }
            }}
          >
            <Folder size={36} className="home-item-icon" />
            <div className="home-item-title">{f.title}</div>
            <div className="sidebar-item-count">{notebookCount(f.id)}</div>
          </button>
        ))}
        {notebooks.map((n) => (
          <button
            key={n.id}
            className="home-item"
            onClick={() => onOpenNotebook(n.id, n.title)}
            onContextMenu={async (e) => {
              e.preventDefault();
              const action = window.prompt("umbenennen (u) oder löschen (l)?");
              if (action === "u") {
                const title = window.prompt("Neuer Name", n.title);
                if (title) await renameNotebook(n.id, title);
              } else if (action === "l") {
                await deleteNotebook(n.id);
              }
            }}
          >
            <NotebookPen size={36} className="home-item-icon" />
            <div className="home-item-title">{n.title}</div>
          </button>
        ))}
        {folders.length === 0 && notebooks.length === 0 && !loading && (
          <p className="hint">Noch keine Notizbücher. Leg mit „+ Notizbuch“ los.</p>
        )}
      </div>
    </div>
  );
}
