import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { Texture } from "pixi.js";
import PageCanvas from "./PageCanvas";
import PageThumbnailStrip, { type ThumbnailEntry } from "./PageThumbnailStrip";
import TextEditOverlay, { type TextEditTarget } from "./TextEditOverlay";
import { PageEngine } from "../engine/renderer/PageEngine";
import { commands } from "../lib/tauri-commands";
import { createBlankPage, createPdfPages } from "../engine/pageFactory";
import { loadPdfDocument, renderPdfPageToCanvas } from "../engine/pdf/pdfRender";
import { loadImageElement } from "../engine/imageLoad";
import { useToolStore } from "../state/toolStore";
import type { NotebookManifest, PageData, PageTemplateKind, SelectionRef } from "../types";

export interface EditorViewProps {
  notebookId: string;
  initialPageId: string | null;
  onPageChange: (pageId: string) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  pageStripVisible: boolean;
}

/** Imperative surface the shell's toolbar drives. */
export interface EditorViewHandle {
  undo: () => void;
  redo: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  addPage: () => void;
  importPdf: () => void;
  importImage: () => void;
  fitWidth: () => void;
}

const EditorView = forwardRef<EditorViewHandle, EditorViewProps>(function EditorView(
  { notebookId, initialPageId, onPageChange, onHistoryChange, onSelectionChange, pageStripVisible },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PageEngine | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const dirtyPagesRef = useRef<Set<string>>(new Set());
  const manifestRef = useRef<NotebookManifest | null>(null);
  const initialPageRef = useRef(initialPageId);

  const [manifest, setManifest] = useState<NotebookManifest | null>(null);
  const [visiblePageId, setVisiblePageId] = useState<string | null>(initialPageId);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [textEditTarget, setTextEditTarget] = useState<TextEditTarget | null>(null);

  const tool = useToolStore((s) => s.tool);
  const color = useToolStore((s) => s.color);
  const width = useToolStore((s) => s.width);
  const shapeMode = useToolStore((s) => s.shapeMode);

  // Callbacks are read through refs so the engine effect depends only on the
  // notebook — the engine must survive page add/delete without a remount.
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onHistoryChangeRef = useRef(onHistoryChange);
  onHistoryChangeRef.current = onHistoryChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const refreshThumbnail = useCallback(
    async (pageId: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        const bytes = await engine.exportThumbnail(pageId);
        const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        setThumbnails((prev) => {
          const old = prev[pageId];
          if (old) URL.revokeObjectURL(old);
          return { ...prev, [pageId]: url };
        });
        await commands.saveThumbnail(notebookId, pageId, bytes);
      } catch (err) {
        console.error("thumbnail export failed", err);
      }
    },
    [notebookId],
  );

  /** Debounced flush of every page touched since the last save. */
  const scheduleSave = useCallback(
    (pageId: string) => {
      dirtyPagesRef.current.add(pageId);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        const engine = engineRef.current;
        if (!engine) return;
        const ids = Array.from(dirtyPagesRef.current);
        dirtyPagesRef.current.clear();
        for (const id of ids) {
          const data = engine.getPageData(id);
          if (!data) continue;
          await commands.savePage(notebookId, id, data);
          await refreshThumbnail(id);
        }
      }, 500);
    },
    [notebookId, refreshThumbnail],
  );

  // Create the engine once per notebook and feed it every page.
  useEffect(() => {
    let disposed = false;
    const el = containerRef.current;
    if (!el) return;

    (async () => {
      const m = await commands.getNotebookManifest(notebookId);
      if (disposed) return;
      manifestRef.current = m;
      setManifest(m);

      const pages: PageData[] = [];
      for (const id of m.pageOrder) {
        try {
          pages.push(await commands.getPage(notebookId, id));
        } catch (err) {
          console.error(`failed to load page ${id}`, err);
        }
      }
      if (disposed) return;

      const engine = new PageEngine({
        container: el,
        pages,
        onChange: scheduleSave,
        onSelectionChange: (sel: SelectionRef[]) => onSelectionChangeRef.current(sel.length > 0),
        onRequestTextEdit: (obj, screenX, screenY) => {
          const rect = el.getBoundingClientRect();
          setTextEditTarget({
            obj,
            screenX: screenX - rect.left,
            screenY: screenY - rect.top,
            scale: engineRef.current?.getViewportScale() ?? 1,
          });
        },
        onVisiblePageChange: (pageId) => {
          setVisiblePageId(pageId);
          onPageChangeRef.current(pageId);
        },
      });
      engineRef.current = engine;
      await engine.whenReady();
      if (disposed) {
        engine.destroy();
        engineRef.current = null;
        return;
      }

      engine.history.setOnChange(() => {
        onHistoryChangeRef.current(engine.history.canUndo(), engine.history.canRedo());
      });
      onHistoryChangeRef.current(false, false);
      onSelectionChangeRef.current(false);
      engine.setTool(tool);
      engine.setColor(color);
      engine.setWidth(width);
      engine.setShapeMode(shapeMode);

      // Restore the page the tab was last on.
      if (initialPageRef.current && m.pageOrder.includes(initialPageRef.current)) {
        engine.scrollToPage(initialPageRef.current, { immediate: true });
        setVisiblePageId(initialPageRef.current);
      } else if (m.pageOrder[0]) {
        setVisiblePageId(m.pageOrder[0]);
      }

      await loadPageAssets(engine, notebookId, pages, () => disposed);
      for (const page of pages) {
        if (disposed) return;
        await refreshThumbnail(page.id);
      }
    })();

    return () => {
      disposed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  useEffect(() => engineRef.current?.setTool(tool), [tool]);
  useEffect(() => engineRef.current?.setColor(color), [color]);
  useEffect(() => engineRef.current?.setWidth(width), [width]);
  useEffect(() => engineRef.current?.setShapeMode(shapeMode), [shapeMode]);

  /** Persists a new page order and hands the updated page set to the engine. */
  const applyManifest = useCallback(
    async (next: NotebookManifest, opts: { scrollTo?: string } = {}) => {
      manifestRef.current = next;
      setManifest(next);
      await commands.saveNotebookManifest(next);

      const engine = engineRef.current;
      if (!engine) return;
      const pages: PageData[] = [];
      for (const id of next.pageOrder) {
        const existing = engine.getPageData(id);
        pages.push(existing ?? (await commands.getPage(notebookId, id)));
      }
      engine.setPages(pages);
      await loadPageAssets(engine, notebookId, pages, () => false);
      if (opts.scrollTo) {
        engine.scrollToPage(opts.scrollTo);
        setVisiblePageId(opts.scrollTo);
      }
    },
    [notebookId],
  );

  const handleAddPage = useCallback(
    async (templateKind?: PageTemplateKind) => {
      const m = manifestRef.current;
      const engine = engineRef.current;
      if (!m || !engine) return;
      const anchorId = visiblePageId ?? m.pageOrder[m.pageOrder.length - 1];
      const template = templateKind
        ? { kind: templateKind }
        : (engine.getPageData(anchorId)?.template ?? { kind: "grid" as const });
      const page = createBlankPage(template);
      await commands.savePage(notebookId, page.id, page);

      const pageOrder = [...m.pageOrder];
      const idx = pageOrder.indexOf(anchorId);
      pageOrder.splice(idx < 0 ? pageOrder.length : idx + 1, 0, page.id);
      await applyManifest({ ...m, pageOrder, modifiedAt: new Date().toISOString() }, { scrollTo: page.id });
      await refreshThumbnail(page.id);
    },
    [notebookId, visiblePageId, applyManifest, refreshThumbnail],
  );

  const handleDeletePage = useCallback(
    async (id: string) => {
      const m = manifestRef.current;
      if (!m || m.pageOrder.length <= 1) return;
      const idx = m.pageOrder.indexOf(id);
      const pageOrder = m.pageOrder.filter((p) => p !== id);
      await commands.deletePage(notebookId, id);
      const scrollTo = pageOrder[Math.max(0, idx - 1)] ?? pageOrder[0];
      await applyManifest({ ...m, pageOrder, modifiedAt: new Date().toISOString() }, { scrollTo });
      setThumbnails((prev) => {
        const next = { ...prev };
        if (next[id]) URL.revokeObjectURL(next[id]);
        delete next[id];
        return next;
      });
    },
    [notebookId, applyManifest],
  );

  const handleMove = useCallback(
    async (id: string, dir: -1 | 1) => {
      const m = manifestRef.current;
      if (!m) return;
      const idx = m.pageOrder.indexOf(id);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= m.pageOrder.length) return;
      const pageOrder = [...m.pageOrder];
      [pageOrder[idx], pageOrder[swapWith]] = [pageOrder[swapWith], pageOrder[idx]];
      await applyManifest({ ...m, pageOrder, modifiedAt: new Date().toISOString() }, { scrollTo: id });
    },
    [applyManifest],
  );

  const handleImportPdf = useCallback(async () => {
    const m = manifestRef.current;
    if (!m) return;
    const path = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!path || typeof path !== "string") return;
    const bytes = await readFile(path);
    const fileName = path.split(/[\\/]/).pop() ?? "document.pdf";
    const storedName = await commands.importAsset(notebookId, fileName, bytes);
    const pages = await createPdfPages(storedName, bytes);
    for (const page of pages) await commands.savePage(notebookId, page.id, page);

    const pageOrder = [...m.pageOrder];
    const idx = pageOrder.indexOf(visiblePageId ?? "");
    pageOrder.splice(idx < 0 ? pageOrder.length : idx + 1, 0, ...pages.map((p) => p.id));
    await applyManifest(
      { ...m, pageOrder, modifiedAt: new Date().toISOString() },
      { scrollTo: pages[0]?.id },
    );
    for (const p of pages) await refreshThumbnail(p.id);
  }, [notebookId, visiblePageId, applyManifest, refreshThumbnail]);

  const handleImportImage = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !visiblePageId) return;
    const path = await open({
      multiple: false,
      filters: [{ name: "Bild", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!path || typeof path !== "string") return;
    const bytes = await readFile(path);
    const fileName = path.split(/[\\/]/).pop() ?? "image.png";
    const storedName = await commands.importAsset(notebookId, fileName, bytes);
    await engine.addImageObjectFromBytes(visiblePageId, bytes, storedName);
  }, [notebookId, visiblePageId]);

  useImperativeHandle(ref, () => ({
    undo: () => engineRef.current?.history.undo(),
    redo: () => engineRef.current?.history.redo(),
    deleteSelection: () => engineRef.current?.deleteSelection(),
    duplicateSelection: () => engineRef.current?.duplicateSelection(),
    copySelection: () => engineRef.current?.copySelection(),
    pasteSelection: () => engineRef.current?.pasteClipboard(),
    addPage: () => handleAddPage(),
    importPdf: () => handleImportPdf(),
    importImage: () => handleImportImage(),
    fitWidth: () => engineRef.current?.fitWidth({ animate: true }),
  }));

  const thumbnailEntries: ThumbnailEntry[] = (manifest?.pageOrder ?? []).map((id) => ({
    id,
    url: thumbnails[id] ?? null,
  }));

  return (
    <div className="editor-surface">
      <div className="editor-canvas-wrap">
        <PageCanvas ref={containerRef} />
        <TextEditOverlay
          target={textEditTarget}
          onCommit={(id, text, fontSize, col) => {
            engineRef.current?.commitTextEdit(id, text, fontSize, col);
            setTextEditTarget(null);
          }}
        />
      </div>
      {pageStripVisible && (
        <PageThumbnailStrip
          pages={thumbnailEntries}
          currentPageId={visiblePageId}
          onSelect={(id) => {
            engineRef.current?.scrollToPage(id);
            setVisiblePageId(id);
          }}
          onDelete={handleDeletePage}
          onMoveUp={(id) => handleMove(id, -1)}
          onMoveDown={(id) => handleMove(id, 1)}
          onAddPage={handleAddPage}
        />
      )}
    </div>
  );
});

/** Loads PDF backgrounds and image textures for pages that reference assets. */
async function loadPageAssets(
  engine: PageEngine,
  notebookId: string,
  pages: PageData[],
  cancelled: () => boolean,
): Promise<void> {
  for (const page of pages) {
    if (cancelled()) return;
    if (page.pdfRef) {
      try {
        const bytes = await commands.readAsset(notebookId, page.pdfRef.assetFile);
        const pdf = await loadPdfDocument(bytes);
        const canvas = await renderPdfPageToCanvas(pdf, page.pdfRef.pageNumber);
        if (!cancelled()) engine.setPdfBackground(page.id, canvas);
      } catch (err) {
        console.error("failed to render pdf background", err);
      }
    }
    for (const imageObj of page.imageObjects) {
      try {
        const bytes = await commands.readAsset(notebookId, imageObj.assetFile);
        const img = await loadImageElement(bytes);
        if (!cancelled()) engine.registerLoadedImageTexture(page.id, imageObj.id, Texture.from(img));
      } catch (err) {
        console.error("failed to load image object", err);
      }
    }
  }
}

export default EditorView;
