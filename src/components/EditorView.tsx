import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { Texture } from "pixi.js";
import Toolbar from "./Toolbar";
import PageCanvas from "./PageCanvas";
import PageThumbnailStrip, { type ThumbnailEntry } from "./PageThumbnailStrip";
import TextEditOverlay, { type TextEditTarget } from "./TextEditOverlay";
import { PageEngine } from "../engine/renderer/PageEngine";
import { commands } from "../lib/tauri-commands";
import { createBlankPage, createPdfPages } from "../engine/pageFactory";
import { loadPdfDocument, renderPdfPageToCanvas } from "../engine/pdf/pdfRender";
import { loadImageElement } from "../engine/imageLoad";
import { useToolStore } from "../state/toolStore";
import type { NotebookManifest, SelectionRef } from "../types";

export interface EditorViewProps {
  notebookId: string;
  onClose: () => void;
}

export default function EditorView({ notebookId, onClose }: EditorViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PageEngine | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const [manifest, setManifest] = useState<NotebookManifest | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<SelectionRef[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [textEditTarget, setTextEditTarget] = useState<TextEditTarget | null>(null);

  const tool = useToolStore((s) => s.tool);
  const color = useToolStore((s) => s.color);
  const width = useToolStore((s) => s.width);
  const shapeMode = useToolStore((s) => s.shapeMode);

  // Load the notebook manifest once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await commands.getNotebookManifest(notebookId);
      if (cancelled) return;
      setManifest(m);
      setPageId(m.pageOrder[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      const engine = engineRef.current;
      if (!engine) return;
      const data = engine.getPageData();
      await commands.savePage(notebookId, data.id, data);
      try {
        const thumb = await engine.exportThumbnail();
        const url = URL.createObjectURL(new Blob([thumb], { type: "image/png" }));
        setThumbnails((prev) => {
          const old = prev[data.id];
          if (old) URL.revokeObjectURL(old);
          return { ...prev, [data.id]: url };
        });
        await commands.saveThumbnail(notebookId, data.id, thumb);
      } catch (err) {
        console.error("thumbnail export failed", err);
      }
    }, 500);
  }, [notebookId]);

  // Mount/unmount the PageEngine whenever the active page changes.
  useEffect(() => {
    if (!pageId || !containerRef.current) return;
    let disposed = false;

    (async () => {
      const data = await commands.getPage(notebookId, pageId);
      if (disposed || !containerRef.current) return;

      const engine = new PageEngine({
        container: containerRef.current,
        page: data,
        onChange: scheduleSave,
        onSelectionChange: setSelection,
        onRequestTextEdit: (obj, screenX, screenY) => {
          const rect = containerRef.current!.getBoundingClientRect();
          setTextEditTarget({
            obj,
            screenX: screenX - rect.left,
            screenY: screenY - rect.top,
            scale: engineRef.current?.viewport.scale.x ?? 1,
          });
        },
        onViewportChange: () => {},
      });
      engineRef.current = engine;
      await engine.whenReady();
      if (disposed) {
        engine.destroy();
        return;
      }
      engine.history.setOnChange(() => {
        setCanUndo(engine.history.canUndo());
        setCanRedo(engine.history.canRedo());
      });
      setCanUndo(false);
      setCanRedo(false);
      setSelection([]);
      engine.setTool(tool);
      engine.setColor(color);
      engine.setWidth(width);
      engine.setShapeMode(shapeMode);

      if (data.pdfRef) {
        try {
          const bytes = await commands.readAsset(notebookId, data.pdfRef.assetFile);
          const pdf = await loadPdfDocument(bytes);
          const canvas = await renderPdfPageToCanvas(pdf, data.pdfRef.pageNumber);
          if (!disposed) engine.setPdfBackground(canvas);
        } catch (err) {
          console.error("failed to render pdf background", err);
        }
      }
      for (const imageObj of data.imageObjects) {
        try {
          const bytes = await commands.readAsset(notebookId, imageObj.assetFile);
          const img = await loadImageElement(bytes);
          if (!disposed) engine.registerLoadedImageTexture(imageObj.id, Texture.from(img));
        } catch (err) {
          console.error("failed to load image object", err);
        }
      }
    })();

    return () => {
      disposed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [notebookId, pageId, scheduleSave]);

  useEffect(() => engineRef.current?.setTool(tool), [tool]);
  useEffect(() => engineRef.current?.setColor(color), [color]);
  useEffect(() => engineRef.current?.setWidth(width), [width]);
  useEffect(() => engineRef.current?.setShapeMode(shapeMode), [shapeMode]);

  const setTool = useToolStore((s) => s.setTool);
  const setColor = useToolStore((s) => s.setColor);
  const setWidth = useToolStore((s) => s.setWidth);
  const setShapeMode = useToolStore((s) => s.setShapeMode);

  const updateManifest = useCallback(
    async (next: NotebookManifest) => {
      setManifest(next);
      await commands.saveNotebookManifest(next);
    },
    [],
  );

  const handleAddPage = useCallback(async () => {
    if (!manifest) return;
    const template = engineRef.current?.getPageData().template ?? { kind: "blank" as const };
    const page = createBlankPage(template);
    await commands.savePage(notebookId, page.id, page);
    const idx = manifest.pageOrder.indexOf(pageId ?? "");
    const pageOrder = [...manifest.pageOrder];
    pageOrder.splice(idx + 1, 0, page.id);
    await updateManifest({ ...manifest, pageOrder, modifiedAt: new Date().toISOString() });
    setPageId(page.id);
  }, [manifest, notebookId, pageId, updateManifest]);

  const handleDeletePage = useCallback(
    async (id: string) => {
      if (!manifest || manifest.pageOrder.length <= 1) return;
      const idx = manifest.pageOrder.indexOf(id);
      const pageOrder = manifest.pageOrder.filter((p) => p !== id);
      await commands.deletePage(notebookId, id);
      await updateManifest({ ...manifest, pageOrder, modifiedAt: new Date().toISOString() });
      if (id === pageId) {
        setPageId(pageOrder[Math.max(0, idx - 1)] ?? pageOrder[0] ?? null);
      }
    },
    [manifest, notebookId, pageId, updateManifest],
  );

  const handleMove = useCallback(
    async (id: string, dir: -1 | 1) => {
      if (!manifest) return;
      const idx = manifest.pageOrder.indexOf(id);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= manifest.pageOrder.length) return;
      const pageOrder = [...manifest.pageOrder];
      [pageOrder[idx], pageOrder[swapWith]] = [pageOrder[swapWith], pageOrder[idx]];
      await updateManifest({ ...manifest, pageOrder, modifiedAt: new Date().toISOString() });
    },
    [manifest, updateManifest],
  );

  const handleImportPdf = useCallback(async () => {
    if (!manifest) return;
    const path = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!path || typeof path !== "string") return;
    const bytes = await readFile(path);
    const fileName = path.split(/[\\/]/).pop() ?? "document.pdf";
    const storedName = await commands.importAsset(notebookId, fileName, bytes);
    const pages = await createPdfPages(storedName, bytes);
    for (const page of pages) {
      await commands.savePage(notebookId, page.id, page);
    }
    const idx = manifest.pageOrder.indexOf(pageId ?? "");
    const pageOrder = [...manifest.pageOrder];
    pageOrder.splice(idx + 1, 0, ...pages.map((p) => p.id));
    await updateManifest({ ...manifest, pageOrder, modifiedAt: new Date().toISOString() });
    if (pages[0]) setPageId(pages[0].id);
  }, [manifest, notebookId, pageId, updateManifest]);

  const handleImportImage = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const path = await open({
      multiple: false,
      filters: [{ name: "Bild", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!path || typeof path !== "string") return;
    const bytes = await readFile(path);
    const fileName = path.split(/[\\/]/).pop() ?? "image.png";
    const storedName = await commands.importAsset(notebookId, fileName, bytes);
    await engine.addImageObjectFromBytes(bytes, storedName);
  }, [notebookId]);

  const thumbnailEntries: ThumbnailEntry[] = (manifest?.pageOrder ?? []).map((id) => ({
    id,
    url: thumbnails[id] ?? null,
  }));

  return (
    <div className="editor-view">
      <Toolbar
        title={manifest?.title ?? ""}
        onBack={onClose}
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        width={width}
        onWidthChange={setWidth}
        shapeMode={shapeMode}
        onShapeModeChange={setShapeMode}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => engineRef.current?.history.undo()}
        onRedo={() => engineRef.current?.history.redo()}
        hasSelection={selection.length > 0}
        onDeleteSelection={() => engineRef.current?.deleteSelection()}
        onDuplicateSelection={() => engineRef.current?.duplicateSelection()}
        onCopySelection={() => engineRef.current?.copySelection()}
        onPasteSelection={() => engineRef.current?.pasteClipboard()}
        onAddPage={handleAddPage}
        onImportPdf={handleImportPdf}
        onImportImage={handleImportImage}
      />
      <div className="editor-body">
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
        <PageThumbnailStrip
          pages={thumbnailEntries}
          currentPageId={pageId}
          onSelect={setPageId}
          onDelete={handleDeletePage}
          onMoveUp={(id) => handleMove(id, -1)}
          onMoveDown={(id) => handleMove(id, 1)}
        />
      </div>
    </div>
  );
}
