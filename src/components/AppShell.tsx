import { useCallback, useEffect, useRef, useState } from "react";
import TabBar from "./TabBar";
import Toolbar from "./Toolbar";
import Sidebar from "./Sidebar";
import HomeView from "./HomeView";
import EditorView, { type EditorViewHandle } from "./EditorView";
import SettingsPanel from "./SettingsPanel";
import { useTabsStore } from "../state/tabsStore";
import { useSettingsStore } from "../state/settingsStore";
import { useToolStore } from "../state/toolStore";
import { useLayout } from "../state/useLayout";

export default function AppShell() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const openNotebookTab = useTabsStore((s) => s.openNotebook);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const setTabPage = useTabsStore((s) => s.setTabPage);

  const theme = useSettingsStore((s) => s.theme);
  const layout = useLayout();

  const tool = useToolStore((s) => s.tool);
  const color = useToolStore((s) => s.color);
  const width = useToolStore((s) => s.width);
  const shapeMode = useToolStore((s) => s.shapeMode);
  const setTool = useToolStore((s) => s.setTool);
  const setColor = useToolStore((s) => s.setColor);
  const setWidth = useToolStore((s) => s.setWidth);
  const setShapeMode = useToolStore((s) => s.setShapeMode);

  const [showHome, setShowHome] = useState(true);
  // On a phone the sidebar covers the canvas, so it starts closed there.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 820);
  const [pageStripVisible, setPageStripVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const editorRef = useRef<EditorViewHandle | null>(null);
  const searchFocusRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Growing past the breakpoint reveals the column layout; shrinking below it
  // should not leave an overlay covering the whole canvas.
  const wasNarrow = useRef(layout.isNarrow);
  useEffect(() => {
    if (wasNarrow.current !== layout.isNarrow) {
      setSidebarOpen(!layout.isNarrow);
      wasNarrow.current = layout.isNarrow;
    }
  }, [layout.isNarrow]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const openNotebook = useCallback(
    (notebookId: string, title: string) => {
      openNotebookTab(notebookId, title);
      setShowHome(false);
      if (layout.isNarrow) setSidebarOpen(false);
    },
    [openNotebookTab, layout.isNarrow],
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
  // The sidebar belongs to the document view; the home screen has its own nav.
  const showSidebar = sidebarOpen && showEditor;

  return (
    <div className={"app-shell" + (layout.isCompact ? " compact" : "")}>
      <TabBar
        onHome={() => setShowHome(true)}
        onAddTab={() => setShowHome(true)}
        onSelectTab={handleSelectTab}
        isHome={showHome}
      />

      {showEditor && (
        <Toolbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          pageStripVisible={pageStripVisible}
          onTogglePageStrip={() => setPageStripVisible((v) => !v)}
          onSearch={() => {
            setSidebarOpen(true);
            requestAnimationFrame(() => searchFocusRef.current?.());
          }}
          onFitWidth={() => editorRef.current?.fitWidth()}
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          width={width}
          onWidthChange={setWidth}
          shapeMode={shapeMode}
          onShapeModeChange={setShapeMode}
          hasSelection={hasSelection}
          onDeleteSelection={() => editorRef.current?.deleteSelection()}
          onDuplicateSelection={() => editorRef.current?.duplicateSelection()}
          onCopySelection={() => editorRef.current?.copySelection()}
          onPasteSelection={() => editorRef.current?.pasteSelection()}
          onAddPage={() => editorRef.current?.addPage()}
          onImportPdf={() => editorRef.current?.importPdf()}
          onImportImage={() => editorRef.current?.importImage()}
        />
      )}

      <div className={"app-shell-body" + (showSidebar && layout.isNarrow ? " sidebar-overlaid" : "")}>
        {showSidebar && (
          <>
            {layout.isNarrow && (
              <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
            )}
            <Sidebar
              floating={layout.isNarrow}
              onClose={() => setSidebarOpen(false)}
              onOpenNotebook={openNotebook}
              onOpenSettings={() => setSettingsOpen(true)}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => editorRef.current?.undo()}
              onRedo={() => editorRef.current?.redo()}
              registerSearchFocus={(fn) => {
                searchFocusRef.current = fn;
              }}
            />
          </>
        )}
        {showEditor ? (
          <EditorView
            key={activeTab.notebookId}
            ref={editorRef}
            notebookId={activeTab.notebookId}
            initialPageId={activeTab.activePageId}
            onPageChange={handlePageChange}
            onHistoryChange={handleHistoryChange}
            onSelectionChange={setHasSelection}
            pageStripVisible={pageStripVisible}
          />
        ) : (
          <HomeView onOpenNotebook={openNotebook} onOpenSettings={() => setSettingsOpen(true)} />
        )}
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
