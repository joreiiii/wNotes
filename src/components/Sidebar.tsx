import { useEffect, useState } from "react";
import { ChevronRight, Folder, FolderPlus, NotebookPen, Redo2, Search, Settings, Undo2 } from "lucide-react";
import { useLibraryStore } from "../state/libraryStore";

export interface SidebarProps {
  onOpenNotebook: (notebookId: string, title: string) => void;
  onOpenSettings: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export default function Sidebar({ onOpenNotebook, onOpenSettings, canUndo, canRedo, onUndo, onRedo }: SidebarProps) {
  const { index, currentFolderId, refresh, setCurrentFolder, createFolder } = useLibraryStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    refresh();
  }, [refresh]);

  const folders = index.folders.filter((f) => f.parentId === currentFolderId);
  const notebooks = index.notebooks.filter((n) => n.parentId === currentFolderId);
  const currentFolder = index.folders.find((f) => f.id === currentFolderId) ?? null;
  const notebookCount = (folderId: string) => index.notebooks.filter((n) => n.parentId === folderId).length;

  const q = query.trim().toLowerCase();
  const filteredFolders = q ? folders.filter((f) => f.title.toLowerCase().includes(q)) : folders;
  const filteredNotebooks = q ? notebooks.filter((n) => n.title.toLowerCase().includes(q)) : notebooks;

  return (
    <div className="sidebar">
      <div className="sidebar-history">
        <button className="icon-btn" disabled={!canUndo} onClick={onUndo} aria-label="Rückgängig">
          <Undo2 size={18} />
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={onRedo} aria-label="Wiederholen">
          <Redo2 size={18} />
        </button>
      </div>

      <div className="sidebar-search">
        <Search size={16} />
        <input placeholder="Suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="sidebar-section-title">
        <span style={{ flex: 1 }}>Ordner</span>
        <button
          className="icon-btn"
          onClick={async () => {
            const title = window.prompt("Ordnername");
            if (title) await createFolder(title);
          }}
          aria-label="Ordner hinzufügen"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {currentFolder && (
        <button className="sidebar-item" onClick={() => setCurrentFolder(currentFolder.parentId)}>
          <span className="sidebar-item-icon">←</span>
          <span className="sidebar-item-label">{currentFolder.title}</span>
        </button>
      )}

      <div className="sidebar-list">
        {filteredFolders.map((f) => (
          <button key={f.id} className="sidebar-item" onClick={() => setCurrentFolder(f.id)}>
            <span className="sidebar-item-icon">
              <Folder size={17} />
            </span>
            <span className="sidebar-item-label">{f.title}</span>
            <span className="sidebar-item-count">{notebookCount(f.id)}</span>
            <ChevronRight size={16} className="sidebar-item-icon" />
          </button>
        ))}
        {filteredNotebooks.map((n) => (
          <button key={n.id} className="sidebar-item" onClick={() => onOpenNotebook(n.id, n.title)}>
            <span className="sidebar-item-icon">
              <NotebookPen size={17} />
            </span>
            <span className="sidebar-item-label">{n.title}</span>
            <ChevronRight size={16} className="sidebar-item-icon" />
          </button>
        ))}
        {filteredFolders.length === 0 && filteredNotebooks.length === 0 && (
          <p className="hint">{q ? "Keine Treffer." : "Leer."}</p>
        )}
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={onOpenSettings}>
          <span className="sidebar-item-icon">
            <Settings size={17} />
          </span>
          <span className="sidebar-item-label">Einstellungen</span>
        </button>
      </div>
    </div>
  );
}
