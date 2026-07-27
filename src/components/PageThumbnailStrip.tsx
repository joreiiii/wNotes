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
}

export default function PageThumbnailStrip(props: PageThumbnailStripProps) {
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
    </div>
  );
}
