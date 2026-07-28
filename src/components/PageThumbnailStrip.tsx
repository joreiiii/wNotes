import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { PageTemplateKind } from "../types";

export interface ThumbnailEntry {
  id: string;
  url: string | null;
}

export interface PageThumbnailStripProps {
  pages: ThumbnailEntry[];
  currentPageId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onAddPage: (templateKind?: PageTemplateKind) => void;
}

const TEMPLATE_OPTIONS: { id: PageTemplateKind; label: string }[] = [
  { id: "blank", label: "Blanko" },
  { id: "lined", label: "Liniert" },
  { id: "grid", label: "Kariert" },
  { id: "dotted", label: "Gepunktet" },
  { id: "graph", label: "Millimeter" },
];

export default function PageThumbnailStrip(props: PageThumbnailStripProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [pickerOpen]);

  return (
    <div className="page-strip">
      {props.pages.map((p, index) => (
        <div
          key={p.id}
          className={"page-thumb" + (p.id === props.currentPageId ? " active" : "")}
          onClick={() => props.onSelect(p.id)}
        >
          {p.url ? <img src={p.url} alt="" /> : <div className="page-thumb-placeholder" />}
          <div className="page-thumb-index">{index + 1}</div>
          <div className="page-thumb-actions">
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onMoveUp(p.id);
              }}
              disabled={index === 0}
            >
              ↑
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onMoveDown(p.id);
              }}
              disabled={index === props.pages.length - 1}
            >
              ↓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (props.pages.length > 1) props.onDelete(p.id);
              }}
              disabled={props.pages.length <= 1}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      <div className="page-thumb-add-wrap" ref={wrapRef}>
        <button className="page-thumb-add" onClick={() => setPickerOpen((v) => !v)} aria-label="Seite hinzufügen">
          <Plus size={20} />
        </button>
        {pickerOpen && (
          <div className="template-picker">
            {TEMPLATE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  props.onAddPage(opt.id);
                  setPickerOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
