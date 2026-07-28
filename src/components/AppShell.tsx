import { useCallback, useEffect, useRef, useState } from "react";
import TabBar from "./TabBar";
import Sidebar from "./Sidebar";
import HomeView from "./HomeView";
import EditorView, { type EditorViewHandle } from "./EditorView";
import SettingsPanel from "./SettingsPanel";
import { useTabsStore } from "../state/tabsStore";
import { useSettingsStore } from "../state/settingsStore";

export default function AppShell() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const openNotebookTab = useTabsStore((s) => s.openNotebook);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const setTabPage = useTabsStore((s) => s.setTabPage);

  const theme = useSettingsStore((s) => s.theme);

  const [showHome, setShowHome] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const editorRef = useRef<EditorViewHandle | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const openNotebook = useCallback(
    (notebookId: string, title: string) => {
      openNotebookTab(notebookId, title);
      setShowHome(false);
    },
    [openNotebookTab],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      setShowHome(false);
    },
    [setActiveTab],
  );

  const handleHistoryChange = useCallback((u: boolean, r: boolean) => {
    setCanUndo(u);
    setCanRedo(r);
  }, []);

  const handlePageChange = useCallback(
    (pageId: string) => {
      if (activeTab) setTabPage(activeTab.id, pageId);
    },
    [activeTab, setTabPage],
  );

  const showEditor = !showHome && !!activeTab;
  const showSidebar = sidebarOpen && showEditor;

  return (
    <div className="app-shell">
      <TabBar
        onHome={() => setShowHome(true)}
        onAddTab={() => setShowHome(true)}
        onSelectTab={handleSelectTab}
        isHome={showHome}
      />
      <div className="app-shell-body">
        {showSidebar && (
          <Sidebar
            onOpenNotebook={openNotebook}
            onOpenSettings={() => setSettingsOpen(true)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => editorRef.current?.undo()}
            onRedo={() => editorRef.current?.redo()}
          />
        )}
        {showEditor ? (
          <EditorView
            key={activeTab.notebookId}
            ref={editorRef}
            notebookId={activeTab.notebookId}
            initialPageId={activeTab.activePageId}
            onPageChange={handlePageChange}
            onHistoryChange={handleHistoryChange}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />
        ) : (
          <HomeView onOpenNotebook={openNotebook} />
        )}
      </div>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
