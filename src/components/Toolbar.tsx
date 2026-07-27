import { MARKER_COLORS, PEN_COLORS } from "../state/toolStore";
import type { ToolId } from "../types";

export interface ToolbarProps {
  title: string;
  onBack: () => void;
  tool: ToolId;
  onToolChange: (tool: ToolId) => void;
  color: string;
  onColorChange: (color: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  shapeMode: boolean;
  onShapeModeChange: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelection: boolean;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onCopySelection: () => void;
  onPasteSelection: () => void;
  onAddPage: () => void;
  onImportPdf: () => void;
  onImportImage: () => void;
}

const DRAW_TOOLS: { id: ToolId; label: string }[] = [
  { id: "pen", label: "Stift" },
  { id: "marker", label: "Marker" },
  { id: "eraser", label: "Radierer" },
  { id: "lasso", label: "Lasso" },
  { id: "text", label: "Text" },
  { id: "pan", label: "Hand" },
];

export default function Toolbar(props: ToolbarProps) {
  const palette = props.tool === "marker" ? MARKER_COLORS : PEN_COLORS;
  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <button className="icon-btn" onClick={props.onBack} aria-label="Zurück zur Bibliothek">
          ←
        </button>
        <span className="toolbar-title">{props.title}</span>
        <div className="toolbar-spacer" />
        <button className="icon-btn" disabled={!props.canUndo} onClick={props.onUndo}>
          ↶
        </button>
        <button className="icon-btn" disabled={!props.canRedo} onClick={props.onRedo}>
          ↷
        </button>
      </div>

      <div className="toolbar-row">
        {DRAW_TOOLS.map((t) => (
          <button
            key={t.id}
            className={"tool-btn" + (props.tool === t.id ? " active" : "")}
            onClick={() => props.onToolChange(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          className={"tool-btn" + (props.shapeMode ? " active" : "")}
          onClick={() => props.onShapeModeChange(!props.shapeMode)}
          title="Formen automatisch erkennen"
        >
          Form
        </button>
      </div>

      {(props.tool === "pen" || props.tool === "marker") && (
        <div className="toolbar-row">
          {palette.map((c) => (
            <button
              key={c}
              className={"color-swatch" + (props.color === c ? " active" : "")}
              style={{ background: c }}
              onClick={() => props.onColorChange(c)}
            />
          ))}
          <input
            type="range"
            min={1}
            max={20}
            value={props.width}
            onChange={(e) => props.onWidthChange(Number(e.target.value))}
          />
        </div>
      )}

      {props.hasSelection && (
        <div className="toolbar-row">
          <button className="tool-btn" onClick={props.onCopySelection}>
            Kopieren
          </button>
          <button className="tool-btn" onClick={props.onPasteSelection}>
            Einfügen
          </button>
          <button className="tool-btn" onClick={props.onDuplicateSelection}>
            Duplizieren
          </button>
          <button className="tool-btn danger" onClick={props.onDeleteSelection}>
            Löschen
          </button>
        </div>
      )}

      <div className="toolbar-row">
        <button className="tool-btn" onClick={props.onAddPage}>
          + Seite
        </button>
        <button className="tool-btn" onClick={props.onImportPdf}>
          PDF importieren
        </button>
        <button className="tool-btn" onClick={props.onImportImage}>
          Bild einfügen
        </button>
      </div>
    </div>
  );
}
