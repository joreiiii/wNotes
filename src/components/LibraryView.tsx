import { useEffect } from "react";
import { useLibraryStore } from "../state/libraryStore";

export interface LibraryViewProps {
  onOpenNotebook: (notebookId: string) => void;
}

export default function LibraryView({ onOpenNotebook }: LibraryViewProps) {
  const { index, currentFolderId, loading, refresh, setCurrentFolder, createFolder, createNotebook, renameFolder, renameNotebook, deleteFolder, deleteNotebook } =
    useLibraryStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const folders = index.folders.filter((f) => f.parentId === currentFolderId);
  const notebooks = index.notebooks.filter((n) => n.parentId === currentFolderId);
  const currentFolder = index.folders.find((f) => f.id === currentFolderId) ?? null;

  return (
    <div className="library-view">
      <div className="library-header">
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
          + Ordner
        </button>
        <button
          className="tool-btn"
          onClick={async () => {
            const title = window.prompt("Notizbuchname", "Neues Notizbuch") ?? "Neues Notizbuch";
            const id = await createNotebook(title);
            onOpenNotebook(id);
          }}
        >
          + Notizbuch
        </button>
      </div>

      {loading && <p className="hint">Lade Bibliothek…</p>}

      <div className="library-grid">
        {folders.map((f) => (
          <div
            key={f.id}
            className="library-item folder"
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
            <div className="folder-icon">📁</div>
            <div className="library-item-title">{f.title}</div>
          </div>
        ))}
        {notebooks.map((n) => (
          <div
            key={n.id}
            className="library-item notebook"
            onClick={() => onOpenNotebook(n.id)}
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
            <div className="notebook-icon">📓</div>
            <div className="library-item-title">{n.title}</div>
          </div>
        ))}
        {folders.length === 0 && notebooks.length === 0 && !loading && (
          <p className="hint">Noch keine Notizbücher. Leg mit „+ Notizbuch“ los.</p>
        )}
      </div>
    </div>
  );
}
