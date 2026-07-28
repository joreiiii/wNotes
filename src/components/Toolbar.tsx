import { useEffect, useRef, useState } from "react";
import {
  Clipboard,
  Copy,
  CopyPlus,
  Eraser,
  FileUp,
  Highlighter,
  Image as ImageIcon,
  Lasso,
  LayoutGrid,
  Pen,
  PanelLeft,
  Plus,
  Shapes,
  Trash2,
  Type,
} from "lucide-react";
import { MARKER_COLORS, PEN_COLORS } from "../state/toolStore";
import type { ToolId } from "../types";

export interface ToolbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  pageStripVisible: boolean;
  onTogglePageStrip: () => void;
  tool: ToolId;
  onToolChange: (tool: ToolId) => void;
  color: string;
  onColorChange: (color: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  shapeMode: boolean;
  onShapeModeChange: (v: boolean) => void;
  hasSelection: boolean;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onCopySelection: () => void;
  onPasteSelection: () => void;
  onAddPage: () => void;
  onImportPdf: () => void;
  onImportImage: () => void;
}

const DRAW_TOOLS: { id: ToolId; label: string; icon: typeof Pen }[] = [
  { id: "pen", label: "Stift", icon: Pen },
  { id: "marker", label: "Marker", icon: Highlighter },
  { id: "eraser", label: "Radierer", icon: Eraser },
  { id: "lasso", label: "Lasso", icon: Lasso },
];

export default function Toolbar(props: ToolbarProps) {
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const palette = props.tool === "marker" ? MARKER_COLORS : PEN_COLORS;

  useEffect(() => {
    if (!colorPopoverOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setColorPopoverOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [colorPopoverOpen]);

  return (
    <div className="toolbar">
      <button
        className={"icon-btn" + (props.sidebarOpen ? " active" : "")}
        onClick={props.onToggleSidebar}
        aria-label="Seitenleiste"
      >
        <PanelLeft size={18} />
      </button>
      <button
        className={"icon-btn" + (props.pageStripVisible ? " active" : "")}
        onClick={props.onTogglePageStrip}
        aria-label="Seitenübersicht"
      >
        <LayoutGrid size={18} />
      </button>

      <div className="toolbar-divider" />

      {DRAW_TOOLS.map((t) => (
        <button
          key={t.id}
          className={"icon-btn" + (props.tool === t.id ? " active" : "")}
          onClick={() => props.onToolChange(t.id)}
          aria-label={t.label}
          title={t.label}
        >
          <t.icon size={18} />
        </button>
      ))}

      {(props.tool === "pen" || props.tool === "marker") && (
        <div className="color-popover-wrap" ref={popoverRef}>
          <button
            className="color-trigger"
            style={{ background: props.color }}
            onClick={() => setColorPopoverOpen((v) => !v)}
            aria-label="Farbe"
          />
          {colorPopoverOpen && (
            <div className="color-popover">
              <div className="color-swatch-row">
                {palette.map((c) => (
                  <button
                    key={c}
                    className={"color-swatch" + (props.color === c ? " active" : "")}
                    style={{ background: c }}
                    onClick={() => props.onColorChange(c)}
                  />
                ))}
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={props.width}
                onChange={(e) => props.onWidthChange(Number(e.target.value))}
              />
            </div>
          )}
        </div>
      )}

      <button
        className={"icon-btn" + (props.tool === "text" ? " active" : "")}
        onClick={() => props.onToolChange("text")}
        aria-label="Text"
        title="Text"
      >
        <Type size={18} />
      </button>
      <button className="icon-btn" onClick={props.onImportImage} aria-label="Bild einfügen" title="Bild einfügen">
        <ImageIcon size={18} />
      </button>
      <button
        className={"icon-btn" + (props.shapeMode ? " active" : "")}
        onClick={() => props.onShapeModeChange(!props.shapeMode)}
        aria-label="Formen erkennen"
        title="Formen erkennen"
      >
        <Shapes size={18} />
      </button>

      <div className="toolbar-divider" />
      <div className="toolbar-spacer" />

      {props.hasSelection && (
        <>
          <button className="icon-btn" onClick={props.onCopySelection} aria-label="Kopieren" title="Kopieren">
            <Copy size={18} />
          </button>
          <button className="icon-btn" onClick={props.onPasteSelection} aria-label="Einfügen" title="Einfügen">
            <Clipboard size={18} />
          </button>
          <button className="icon-btn" onClick={props.onDuplicateSelection} aria-label="Duplizieren" title="Duplizieren">
            <CopyPlus size={18} />
          </button>
          <button className="icon-btn" onClick={props.onDeleteSelection} aria-label="Löschen" title="Löschen">
            <Trash2 size={18} />
          </button>
          <div className="toolbar-divider" />
        </>
      )}

      <button className="icon-btn" onClick={props.onImportPdf} aria-label="PDF importieren" title="PDF importieren">
        <FileUp size={18} />
      </button>
      <button className="icon-btn" onClick={props.onAddPage} aria-label="Seite hinzufügen" title="Seite hinzufügen">
        <Plus size={18} />
      </button>
    </div>
  );
}
