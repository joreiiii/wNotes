import { useEffect } from "react";
import { Folder, FolderPlus, NotebookPen, Plus, Settings } from "lucide-react";
import { useLibraryStore } from "../state/libraryStore";
import { chooseAction, confirmAction, promptText } from "../state/dialogStore";
import { useLongPress } from "../lib/useLongPress";

export interface HomeViewProps {
  onOpenNotebook: (notebookId: string, title: string) => void;
  onOpenSettings: () => void;
}

export default function HomeView({ onOpenNotebook, onOpenSettings }: HomeViewProps) {
  const {
    index,
    currentFolderId,
    loading,
    refresh,
    setCurrentFolder,
    createFolder,
    createNotebook,
    renameFolder,
    renameNotebook,
    deleteFolder,
    deleteNotebook,
  } = useLibraryStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const folders = index.folders.filter((f) => f.parentId === currentFolderId);
  const notebooks = index.notebooks.filter((n) => n.parentId === currentFolderId);
  const currentFolder = index.folders.find((f) => f.id === currentFolderId) ?? null;
  const notebookCount = (folderId: string) => index.notebooks.filter((n) => n.parentId === folderId).length;

  /** Long-press and right-click both open the same item menu. */
  const itemMenu = async (kind: "folder" | "notebook", id: string, title: string) => {
    const action = await chooseAction({
      title,
      actions: [
        { id: "rename", label: "Umbenennen" },
        { id: "delete", label: "Löschen", destructive: true },
      ],
    });
    if (action === "rename") {
      const next = await promptText({ title: "Umbenennen", defaultValue: title, confirmLabel: "Speichern" });
      if (next) {
        if (kind === "folder") await renameFolder(id, next);
        else await renameNotebook(id, next);
      }
    } else if (action === "delete") {
      const ok = await confirmAction({
        title: `„${title}" löschen?`,
        message:
          kind === "folder"
            ? "Der Ordner und alle Notizbücher darin werden gelöscht. Das lässt sich nicht widerrufen."
            : "Das Notizbuch und alle Seiten darin werden gelöscht. Das lässt sich nicht widerrufen.",
        confirmLabel: "Löschen",
        destructive: true,
      });
      if (ok) {
        if (kind === "folder") await deleteFolder(id);
        else await deleteNotebook(id);
      }
    }
  };

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
            const title = await promptText({
              title: "Neuer Ordner",
              placeholder: "Name des Ordners",
              confirmLabel: "Anlegen",
            });
            if (title) await createFolder(title);
          }}
        >
          <FolderPlus size={16} /> Ordner
        </button>
        <button
          className="tool-btn"
          onClick={async () => {
            const title = await promptText({
              title: "Neues Notizbuch",
              defaultValue: "Neues Notizbuch",
              confirmLabel: "Anlegen",
            });
            if (!title) return;
            const id = await createNotebook(title);
            onOpenNotebook(id, title);
          }}
        >
          <Plus size={16} /> Notizbuch
        </button>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="Einstellungen" title="Einstellungen">
          <Settings size={20} />
        </button>
      </div>

      {loading && <p className="hint">Lade Bibliothek…</p>}

      <div className="home-grid">
        {folders.map((f, i) => (
          <HomeItem
            key={f.id}
            index={i}
            title={f.title}
            count={notebookCount(f.id)}
            icon={<Folder size={36} className="home-item-icon" />}
            onOpen={() => setCurrentFolder(f.id)}
            onMenu={() => itemMenu("folder", f.id, f.title)}
          />
        ))}
        {notebooks.map((n, i) => (
          <HomeItem
            key={n.id}
            index={folders.length + i}
            title={n.title}
            icon={<NotebookPen size={36} className="home-item-icon" />}
            onOpen={() => onOpenNotebook(n.id, n.title)}
            onMenu={() => itemMenu("notebook", n.id, n.title)}
          />
        ))}
        {folders.length === 0 && notebooks.length === 0 && !loading && (
          <p className="hint">Noch keine Notizbücher. Leg mit „+ Notizbuch" los.</p>
        )}
      </div>
    </div>
  );
}

interface HomeItemProps {
  index: number;
  title: string;
  count?: number;
  icon: React.ReactNode;
  onOpen: () => void;
  onMenu: () => void;
}

function HomeItem({ index, title, count, icon, onOpen, onMenu }: HomeItemProps) {
  const longPress = useLongPress(onMenu);
  return (
    <button
      className="home-item enter"
      // Staggered entry so the grid assembles rather than appearing at once.
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu();
      }}
      {...longPress}
    >
      {icon}
      <div className="home-item-title">{title}</div>
      {count !== undefined && <div className="sidebar-item-count">{count}</div>}
    </button>
  );
}
