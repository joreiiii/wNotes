export type ToolId = "pen" | "marker" | "eraser" | "shape" | "text" | "image" | "lasso" | "pan";

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

export type ShapeKind = "line" | "rectangle" | "ellipse" | null;

export interface Stroke {
  id: string;
  tool: "pen" | "marker";
  color: string;
  /** base stroke width in page units, before pressure modulation */
  width: number;
  points: StrokePoint[];
  shape: ShapeKind;
  /** true when captured from mouse/touch (no real pressure signal) */
  simulatePressure: boolean;
  /** axis-aligned bounding box, kept in sync for fast lasso/eraser hit-testing */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface TextObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface ImageObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  assetFile: string;
}

export type PageTemplateKind = "blank" | "lined" | "grid" | "dotted" | "graph";

export interface PageTemplate {
  kind: PageTemplateKind;
  color?: string;
}

export interface PdfRef {
  assetFile: string;
  pageNumber: number;
}

export interface PageData {
  id: string;
  width: number;
  height: number;
  template: PageTemplate;
  pdfRef: PdfRef | null;
  strokes: Stroke[];
  textObjects: TextObject[];
  imageObjects: ImageObject[];
}

export interface NotebookManifest {
  id: string;
  title: string;
  pageOrder: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface FolderEntry {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
}

export interface NotebookEntry {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
  createdAt: string;
  modifiedAt: string;
}

export interface LibraryIndex {
  folders: FolderEntry[];
  notebooks: NotebookEntry[];
}

/** Any object placed on a page that selection/transform tools operate on. */
export type SelectableKind = "stroke" | "text" | "image";

export interface SelectionRef {
  kind: SelectableKind;
  id: string;
}
