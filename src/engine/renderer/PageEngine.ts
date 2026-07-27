import { Application, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { v4 as uuidv4 } from "uuid";
import type {
  ImageObject,
  PageData,
  SelectionRef,
  ShapeKind,
  Stroke,
  StrokePoint,
  TextObject,
  ToolId,
} from "../../types";
import { HistoryStack, type Command } from "../history/HistoryStack";
import { strokeToPolygon } from "../stroke/outline";
import { computeStrokeBounds, distanceToStroke, pointInBounds } from "../stroke/bounds";
import { recognizeShape, shapeToPoints } from "../stroke/shapeRecognition";
import { pointInPolygon, unionBounds } from "../selection/hitTest";
import { applyAffineToPoint } from "../selection/transform";
import { getClipboard, setClipboard } from "../selection/clipboard";
import { buildTemplateTexture } from "./templates";
import { loadImageElement } from "../imageLoad";

const MARKER_ALPHA = 0.35;
const ERASER_RADIUS = 14;
const PALM_REJECTION_WINDOW_MS = 1000;

export interface PageEngineOptions {
  container: HTMLDivElement;
  page: PageData;
  onChange: () => void;
  onSelectionChange: (sel: SelectionRef[]) => void;
  onRequestTextEdit: (obj: TextObject, screenX: number, screenY: number) => void;
  onViewportChange: () => void;
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export class PageEngine {
  app: Application;
  viewport!: Viewport;
  history = new HistoryStack();
  page: PageData;

  private container: HTMLDivElement;
  private backgroundLayer = new Container();
  private pdfLayer = new Container();
  private inkLayer = new Container();
  private objectLayer = new Container();
  private overlayLayer = new Container();

  private strokeGraphics = new Map<string, Graphics>();
  private textViews = new Map<string, Container>();
  private imageViews = new Map<string, Sprite>();

  private tool: ToolId = "pen";
  private color = "#1c1c1e";
  private width = 3;
  private shapeMode = false;

  private drawing = false;
  private activePointerId: number | null = null;
  private lastPenActivityAt = 0;
  private currentPoints: StrokePoint[] = [];
  private previewGraphic: Graphics | null = null;

  private lassoActive = false;
  private lassoPoints: { x: number; y: number }[] = [];
  private lassoGraphic: Graphics | null = null;

  private selection = new Set<string>();
  private selectionKind = new Map<string, "stroke" | "text" | "image">();
  private selectionBox: Graphics | null = null;
  private scaleHandleWorld: { x: number; y: number } | null = null;
  private rotateHandleWorld: { x: number; y: number } | null = null;
  private dragState: {
    mode: "move" | "scale" | "rotate";
    startX: number;
    startY: number;
    pivotX: number;
    pivotY: number;
  } | null = null;

  private onChange: () => void;
  private onSelectionChange: (sel: SelectionRef[]) => void;
  private onRequestTextEdit: (obj: TextObject, screenX: number, screenY: number) => void;
  private onViewportChange: () => void;

  private ready: Promise<void>;

  constructor(opts: PageEngineOptions) {
    this.container = opts.container;
    this.page = opts.page;
    this.onChange = opts.onChange;
    this.onSelectionChange = opts.onSelectionChange;
    this.onRequestTextEdit = opts.onRequestTextEdit;
    this.onViewportChange = opts.onViewportChange;
    this.app = new Application();
    this.ready = this.init();
  }

  private async init() {
    const rect = this.container.getBoundingClientRect();
    await this.app.init({
      width: Math.max(rect.width, 100),
      height: Math.max(rect.height, 100),
      background: "#e9edf2",
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      eventMode: "static",
    });
    this.container.appendChild(this.app.canvas);

    this.viewport = new Viewport({
      screenWidth: this.app.screen.width,
      screenHeight: this.app.screen.height,
      worldWidth: this.page.width,
      worldHeight: this.page.height,
      events: this.app.renderer.events,
    });
    this.app.stage.addChild(this.viewport);
    this.viewport
      .drag()
      .pinch()
      .wheel()
      .clampZoom({ minScale: 0.2, maxScale: 6 });

    this.viewport.addChild(this.backgroundLayer, this.pdfLayer, this.inkLayer, this.objectLayer, this.overlayLayer);
    this.viewport.eventMode = "static";
    this.viewport.hitArea = new Rectangle(-2000, -2000, this.page.width + 4000, this.page.height + 4000);

    this.renderBackground();
    this.renderAllStrokes();
    this.renderAllObjects();
    this.centerView();
    this.applyToolMode();

    this.viewport.on("pointerdown", this.onPointerDown);
    this.viewport.on("pointermove", this.onPointerMove);
    this.viewport.on("pointerup", this.onPointerUp);
    this.viewport.on("pointerupoutside", this.onPointerUp);
    this.viewport.on("moved", this.onViewportChange);
    this.viewport.on("zoomed", this.onViewportChange);

    window.addEventListener("resize", this.handleResize);
    this.handleResize();
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  private handleResize = () => {
    const rect = this.container.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.app.renderer.resize(rect.width, rect.height);
    this.viewport.resize(rect.width, rect.height);
  };

  private centerView() {
    this.viewport.fit(true, this.page.width, this.page.height);
    this.viewport.moveCenter(this.page.width / 2, this.page.height / 2);
  }

  // ---------- background / template / pdf ----------

  private renderBackground() {
    this.backgroundLayer.removeChildren();
    const texture = buildTemplateTexture(this.page.template, this.page.width, this.page.height);
    const sprite = new Sprite(texture);
    sprite.width = this.page.width;
    sprite.height = this.page.height;
    this.backgroundLayer.addChild(sprite);
  }

  setPdfBackground(canvas: HTMLCanvasElement | null) {
    this.pdfLayer.removeChildren();
    if (!canvas) return;
    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);
    sprite.width = this.page.width;
    sprite.height = this.page.height;
    this.pdfLayer.addChild(sprite);
  }

  // ---------- tool state ----------

  setTool(tool: ToolId) {
    this.tool = tool;
    this.clearSelection();
    this.applyToolMode();
  }

  setColor(color: string) {
    this.color = color;
  }

  setWidth(width: number) {
    this.width = width;
  }

  setShapeMode(enabled: boolean) {
    this.shapeMode = enabled;
  }

  private applyToolMode() {
    const isDrawTool = this.tool === "pen" || this.tool === "marker" || this.tool === "eraser" || this.tool === "lasso";
    if (isDrawTool) {
      this.viewport.plugins.pause("drag");
    } else {
      this.viewport.plugins.resume("drag");
    }
  }

  // ---------- pointer pipeline ----------

  private toStrokePoint(e: FederatedPointerEvent): StrokePoint {
    const world = this.viewport.toWorld(e.global);
    const native = e.nativeEvent as PointerEvent;
    return {
      x: world.x,
      y: world.y,
      pressure: native.pressure > 0 ? native.pressure : 0.5,
      tiltX: native.tiltX ?? 0,
      tiltY: native.tiltY ?? 0,
    };
  }

  private isPalmTouch(e: FederatedPointerEvent): boolean {
    const native = e.nativeEvent as PointerEvent;
    if (native.pointerType === "pen") {
      this.lastPenActivityAt = performance.now();
      return false;
    }
    if (native.pointerType === "touch") {
      return performance.now() - this.lastPenActivityAt < PALM_REJECTION_WINDOW_MS;
    }
    return false;
  }

  private onPointerDown = (e: FederatedPointerEvent) => {
    if (this.activePointerId !== null) return;

    if (this.tool === "text") {
      const world = this.viewport.toWorld(e.global);
      const existing = this.page.textObjects.find(
        (t) => world.x >= t.x && world.x <= t.x + t.width && world.y >= t.y && world.y <= t.y + t.height,
      );
      const obj = existing ?? this.addTextObjectAt(world.x, world.y);
      const screen = this.worldToScreen(obj.x, obj.y);
      this.onRequestTextEdit(obj, screen.x, screen.y);
      return;
    }

    if (this.tool === "pen" || this.tool === "marker" || this.tool === "eraser") {
      if (this.isPalmTouch(e)) return;
      this.activePointerId = e.pointerId;
      this.drawing = true;
      const p = this.toStrokePoint(e);
      if (this.tool === "eraser") {
        this.eraseAt(p.x, p.y);
      } else {
        this.currentPoints = [p];
      }
      return;
    }

    if (this.tool === "lasso") {
      if (this.isPalmTouch(e)) return;
      const world = this.viewport.toWorld(e.global);
      const handle = this.hitTestSelectionHandle(world.x, world.y);
      if (handle) {
        this.activePointerId = e.pointerId;
        this.beginTransform(handle, world.x, world.y);
        return;
      }
      const hit = this.hitTestObjectAt(world.x, world.y);
      if (hit) {
        this.activePointerId = e.pointerId;
        if (!this.selection.has(hit.id)) {
          this.setSelection([hit]);
        }
        this.beginTransform("move", world.x, world.y);
        return;
      }
      this.activePointerId = e.pointerId;
      this.lassoActive = true;
      this.lassoPoints = [world];
      this.clearSelection();
      return;
    }
  };

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;
    const world = this.viewport.toWorld(e.global);

    if (this.drawing) {
      if (this.tool === "eraser") {
        this.eraseAt(world.x, world.y);
      } else {
        const native = e.nativeEvent as PointerEvent;
        this.currentPoints.push({
          x: world.x,
          y: world.y,
          pressure: native.pressure > 0 ? native.pressure : 0.5,
          tiltX: native.tiltX ?? 0,
          tiltY: native.tiltY ?? 0,
        });
        this.renderPreview();
      }
      return;
    }

    if (this.lassoActive) {
      this.lassoPoints.push(world);
      this.renderLassoPreview();
      return;
    }

    if (this.dragState) {
      this.updateTransform(world.x, world.y);
    }
  };

  private onPointerUp = (e: FederatedPointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;

    if (this.drawing) {
      this.drawing = false;
      if (this.tool === "eraser") {
        this.commitEraseHistory();
      } else {
        this.finishStroke();
      }
      this.clearPreview();
      return;
    }

    if (this.lassoActive) {
      this.lassoActive = false;
      this.finishLasso();
      return;
    }

    if (this.dragState) {
      this.commitTransform();
      this.dragState = null;
    }
  };

  // ---------- drawing ----------

  private renderPreview() {
    this.clearPreview();
    if (this.currentPoints.length < 2) return;
    const draft: Stroke = {
      id: "__preview__",
      tool: this.tool === "marker" ? "marker" : "pen",
      color: this.color,
      width: this.width,
      points: this.currentPoints,
      shape: null,
      simulatePressure: this.currentPoints.every((p) => p.pressure === 0.5),
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
    this.previewGraphic = this.buildStrokeGraphic(draft);
    this.overlayLayer.addChild(this.previewGraphic);
  }

  private clearPreview() {
    if (this.previewGraphic) {
      this.previewGraphic.destroy();
      this.previewGraphic = null;
    }
  }

  private buildStrokeGraphic(stroke: Stroke): Graphics {
    const g = new Graphics();
    const polygon = strokeToPolygon(stroke);
    if (polygon.length >= 3) {
      const flat: number[] = [];
      for (const [x, y] of polygon) flat.push(x, y);
      const colorNum = Number.parseInt(stroke.color.replace("#", "0x"));
      g.poly(flat).fill({ color: colorNum, alpha: stroke.tool === "marker" ? MARKER_ALPHA : 1 });
      if (stroke.tool === "marker") g.blendMode = "multiply";
    }
    return g;
  }

  private finishStroke() {
    if (this.currentPoints.length < 2) {
      this.currentPoints = [];
      return;
    }
    let points = this.currentPoints;
    let shape: ShapeKind = null;
    if (this.shapeMode) {
      shape = recognizeShape(points);
      if (shape) points = shapeToPoints(shape, points);
    }
    const stroke: Stroke = {
      id: uuidv4(),
      tool: this.tool === "marker" ? "marker" : "pen",
      color: this.color,
      width: this.width,
      points,
      shape,
      simulatePressure: points.every((p) => p.pressure === 0.5),
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
    stroke.bounds = computeStrokeBounds(stroke);
    this.currentPoints = [];

    const cmd: Command = {
      do: () => {
        this.page.strokes.push(stroke);
        this.renderStroke(stroke);
        this.onChange();
      },
      undo: () => {
        this.page.strokes = this.page.strokes.filter((s) => s.id !== stroke.id);
        this.removeStrokeGraphic(stroke.id);
        this.onChange();
      },
    };
    this.history.push(cmd);
  }

  private renderStroke(stroke: Stroke) {
    this.removeStrokeGraphic(stroke.id);
    const g = this.buildStrokeGraphic(stroke);
    this.strokeGraphics.set(stroke.id, g);
    this.inkLayer.addChild(g);
  }

  private removeStrokeGraphic(id: string) {
    const g = this.strokeGraphics.get(id);
    if (g) {
      g.destroy();
      this.strokeGraphics.delete(id);
    }
  }

  private renderAllStrokes() {
    for (const s of this.page.strokes) this.renderStroke(s);
  }

  // ---------- eraser ----------

  private eraseAt(x: number, y: number) {
    const toRemove: Stroke[] = [];
    for (const stroke of this.page.strokes) {
      if (!pointInBounds(x, y, stroke.bounds)) continue;
      if (distanceToStroke(x, y, stroke) <= ERASER_RADIUS) toRemove.push(stroke);
    }
    if (toRemove.length === 0) return;
    const ids = new Set(toRemove.map((s) => s.id));
    this.page.strokes = this.page.strokes.filter((s) => !ids.has(s.id));
    for (const s of toRemove) this.removeStrokeGraphic(s.id);
    this.pendingErase.push(...toRemove);
    this.onChange();
  }

  private pendingErase: Stroke[] = [];

  /** Erasing already happened live per pointer-move; this just records one undo step for the whole gesture. */
  private commitEraseHistory() {
    if (this.pendingErase.length === 0) return;
    const erased = this.pendingErase;
    this.pendingErase = [];
    const cmd: Command = {
      do: () => {
        const ids = new Set(erased.map((s) => s.id));
        this.page.strokes = this.page.strokes.filter((s) => !ids.has(s.id));
        for (const s of erased) this.removeStrokeGraphic(s.id);
        this.onChange();
      },
      undo: () => {
        for (const s of erased) {
          this.page.strokes.push(s);
          this.renderStroke(s);
        }
        this.onChange();
      },
    };
    this.history.pushExecuted(cmd);
  }

  // ---------- text objects ----------

  addTextObjectAt(worldX: number, worldY: number): TextObject {
    const obj: TextObject = {
      id: uuidv4(),
      x: worldX,
      y: worldY,
      width: 220,
      height: 60,
      rotation: 0,
      text: "",
      fontSize: 24,
      fontFamily: "system-ui, sans-serif",
      color: this.color,
    };
    const cmd: Command = {
      do: () => {
        this.page.textObjects.push(obj);
        this.renderTextObject(obj);
        this.onChange();
      },
      undo: () => {
        this.page.textObjects = this.page.textObjects.filter((t) => t.id !== obj.id);
        this.removeTextView(obj.id);
        this.onChange();
      },
    };
    this.history.push(cmd);
    return obj;
  }

  commitTextEdit(id: string, text: string, fontSize: number, color: string) {
    const obj = this.page.textObjects.find((t) => t.id === id);
    if (!obj) return;
    if (text.trim().length === 0) {
      this.page.textObjects = this.page.textObjects.filter((t) => t.id !== id);
      this.removeTextView(id);
      this.onChange();
      return;
    }
    obj.text = text;
    obj.fontSize = fontSize;
    obj.color = color;
    this.renderTextObject(obj);
    this.onChange();
  }

  private renderTextObject(obj: TextObject) {
    this.removeTextView(obj.id);
    if (!obj.text) return;
    const g = new Container();
    const textEl = new Text({
      text: obj.text,
      style: { fontFamily: obj.fontFamily, fontSize: obj.fontSize, fill: obj.color, wordWrap: true, wordWrapWidth: obj.width },
    });
    g.addChild(textEl);
    g.position.set(obj.x, obj.y);
    g.rotation = obj.rotation;
    this.textViews.set(obj.id, g);
    this.objectLayer.addChild(g);
  }

  private removeTextView(id: string) {
    const v = this.textViews.get(id);
    if (v) {
      v.destroy({ children: true });
      this.textViews.delete(id);
    }
  }

  private renderAllObjects() {
    for (const t of this.page.textObjects) this.renderTextObject(t);
    for (const i of this.page.imageObjects) this.renderImageObjectSync(i);
  }

  // ---------- image objects ----------

  async addImageObjectFromBytes(bytes: Uint8Array, assetFile: string): Promise<void> {
    const img = await loadImageElement(bytes);
    const maxDim = Math.min(this.page.width, this.page.height) * 0.5;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = img.width * scale;
    const height = img.height * scale;
    const obj: ImageObject = {
      id: uuidv4(),
      x: (this.page.width - width) / 2,
      y: (this.page.height - height) / 2,
      width,
      height,
      rotation: 0,
      assetFile,
    };
    const texture = Texture.from(img);
    const cmd: Command = {
      do: () => {
        this.page.imageObjects.push(obj);
        this.renderImageObject(obj, texture);
        this.onChange();
      },
      undo: () => {
        this.page.imageObjects = this.page.imageObjects.filter((i) => i.id !== obj.id);
        this.removeImageView(obj.id);
        this.onChange();
      },
    };
    this.history.push(cmd);
  }

  /** Used for image objects already loaded from disk on page load (texture created by caller). */
  registerLoadedImageTexture(id: string, texture: Texture) {
    const obj = this.page.imageObjects.find((i) => i.id === id);
    if (obj) this.renderImageObject(obj, texture);
  }

  private renderImageObjectSync(_obj: ImageObject) {
    // Placeholder box until the real texture is loaded and registerLoadedImageTexture runs.
  }

  private renderImageObject(obj: ImageObject, texture: Texture) {
    this.removeImageView(obj.id);
    const sprite = new Sprite(texture);
    sprite.x = obj.x;
    sprite.y = obj.y;
    sprite.width = obj.width;
    sprite.height = obj.height;
    sprite.rotation = obj.rotation;
    this.imageViews.set(obj.id, sprite);
    this.objectLayer.addChild(sprite);
  }

  private removeImageView(id: string) {
    const v = this.imageViews.get(id);
    if (v) {
      v.destroy();
      this.imageViews.delete(id);
    }
  }

  // ---------- lasso selection ----------

  private renderLassoPreview() {
    if (this.lassoGraphic) this.lassoGraphic.destroy();
    this.lassoGraphic = new Graphics();
    if (this.lassoPoints.length >= 2) {
      const flat: number[] = [];
      for (const p of this.lassoPoints) flat.push(p.x, p.y);
      this.lassoGraphic
        .poly(flat)
        .fill({ color: 0x3478f6, alpha: 0.12 })
        .stroke({ width: 2 / this.viewport.scale.x, color: 0x3478f6 });
    }
    this.overlayLayer.addChild(this.lassoGraphic);
  }

  private finishLasso() {
    if (this.lassoGraphic) {
      this.lassoGraphic.destroy();
      this.lassoGraphic = null;
    }
    if (this.lassoPoints.length < 3) {
      this.lassoPoints = [];
      return;
    }
    const polygon = this.lassoPoints;
    const refs: SelectionRef[] = [];
    for (const s of this.page.strokes) {
      const cx = (s.bounds.minX + s.bounds.maxX) / 2;
      const cy = (s.bounds.minY + s.bounds.maxY) / 2;
      if (pointInPolygon(cx, cy, polygon)) refs.push({ kind: "stroke", id: s.id });
    }
    for (const t of this.page.textObjects) {
      const cx = t.x + t.width / 2;
      const cy = t.y + t.height / 2;
      if (pointInPolygon(cx, cy, polygon)) refs.push({ kind: "text", id: t.id });
    }
    for (const i of this.page.imageObjects) {
      const cx = i.x + i.width / 2;
      const cy = i.y + i.height / 2;
      if (pointInPolygon(cx, cy, polygon)) refs.push({ kind: "image", id: i.id });
    }
    this.lassoPoints = [];
    this.setSelection(refs);
  }

  private hitTestObjectAt(x: number, y: number): SelectionRef | null {
    for (let i = this.page.imageObjects.length - 1; i >= 0; i--) {
      const o = this.page.imageObjects[i];
      if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height) {
        return { kind: "image", id: o.id };
      }
    }
    for (let i = this.page.textObjects.length - 1; i >= 0; i--) {
      const o = this.page.textObjects[i];
      if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height) {
        return { kind: "text", id: o.id };
      }
    }
    for (let i = this.page.strokes.length - 1; i >= 0; i--) {
      const s = this.page.strokes[i];
      if (pointInBounds(x, y, s.bounds) && distanceToStroke(x, y, s) <= Math.max(s.width, 8)) {
        return { kind: "stroke", id: s.id };
      }
    }
    return null;
  }

  private hitTestSelectionHandle(x: number, y: number): "scale" | "rotate" | null {
    const tolerance = 16 / this.viewport.scale.x;
    if (this.scaleHandleWorld && Math.hypot(x - this.scaleHandleWorld.x, y - this.scaleHandleWorld.y) <= tolerance) {
      return "scale";
    }
    if (this.rotateHandleWorld && Math.hypot(x - this.rotateHandleWorld.x, y - this.rotateHandleWorld.y) <= tolerance) {
      return "rotate";
    }
    return null;
  }

  // ---------- selection state ----------

  setSelection(refs: SelectionRef[]) {
    this.selection = new Set(refs.map((r) => r.id));
    this.selectionKind = new Map(refs.map((r) => [r.id, r.kind]));
    this.renderSelectionBox();
    this.onSelectionChange(refs);
  }

  clearSelection() {
    this.selection.clear();
    this.selectionKind.clear();
    if (this.selectionBox) {
      this.selectionBox.destroy();
      this.selectionBox = null;
    }
    this.onSelectionChange([]);
  }

  private getSelectionBounds(): Bounds | null {
    const boxes: Bounds[] = [];
    for (const id of this.selection) {
      const kind = this.selectionKind.get(id);
      if (kind === "stroke") {
        const s = this.page.strokes.find((s) => s.id === id);
        if (s) boxes.push(s.bounds);
      } else if (kind === "text") {
        const t = this.page.textObjects.find((t) => t.id === id);
        if (t) boxes.push({ minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height });
      } else if (kind === "image") {
        const i = this.page.imageObjects.find((i) => i.id === id);
        if (i) boxes.push({ minX: i.x, minY: i.y, maxX: i.x + i.width, maxY: i.y + i.height });
      }
    }
    return unionBounds(boxes);
  }

  private renderSelectionBox() {
    if (this.selectionBox) {
      this.selectionBox.destroy();
      this.selectionBox = null;
    }
    const bounds = this.getSelectionBounds();
    if (!bounds) {
      this.scaleHandleWorld = null;
      this.rotateHandleWorld = null;
      return;
    }
    const g = new Graphics();
    const inv = 1 / this.viewport.scale.x;
    g.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY).stroke({
      width: 2 * inv,
      color: 0x3478f6,
    });
    const handleSize = 10 * inv;
    this.scaleHandleWorld = { x: bounds.maxX, y: bounds.maxY };
    this.rotateHandleWorld = { x: bounds.minX + (bounds.maxX - bounds.minX) / 2, y: bounds.minY - 24 * inv };
    g.rect(this.scaleHandleWorld.x - handleSize / 2, this.scaleHandleWorld.y - handleSize / 2, handleSize, handleSize).fill(
      0x3478f6,
    );
    g.circle(this.rotateHandleWorld.x, this.rotateHandleWorld.y, handleSize / 2).fill(0x3478f6);
    this.selectionBox = g;
    this.overlayLayer.addChild(g);
  }

  private beginTransform(mode: "move" | "scale" | "rotate", worldX: number, worldY: number) {
    const bounds = this.getSelectionBounds();
    if (!bounds) return;
    this.dragState = {
      mode,
      startX: worldX,
      startY: worldY,
      pivotX: (bounds.minX + bounds.maxX) / 2,
      pivotY: (bounds.minY + bounds.maxY) / 2,
    };
  }

  /** Each call applies only the delta since the last frame (about the gesture's fixed pivot), then advances the reference point. */
  private updateTransform(worldX: number, worldY: number) {
    if (!this.dragState) return;
    const { mode, startX, startY, pivotX, pivotY } = this.dragState;

    if (mode === "move") {
      const dx = worldX - startX;
      const dy = worldY - startY;
      this.applyLiveTransform({ pivotX, pivotY, dx, dy, scale: 1, rotation: 0 });
    } else if (mode === "scale") {
      const startDist = Math.hypot(startX - pivotX, startY - pivotY) || 1;
      const currentDist = Math.hypot(worldX - pivotX, worldY - pivotY) || 1;
      const scale = currentDist / startDist;
      this.applyLiveTransform({ pivotX, pivotY, dx: 0, dy: 0, scale, rotation: 0 });
    } else if (mode === "rotate") {
      const startAngle = Math.atan2(startY - pivotY, startX - pivotX);
      const currentAngle = Math.atan2(worldY - pivotY, worldX - pivotX);
      this.applyLiveTransform({ pivotX, pivotY, dx: 0, dy: 0, scale: 1, rotation: currentAngle - startAngle });
    }

    this.dragState.startX = worldX;
    this.dragState.startY = worldY;
  }

  private applyLiveTransform(params: { pivotX: number; pivotY: number; dx: number; dy: number; scale: number; rotation: number }) {
    for (const id of this.selection) {
      const kind = this.selectionKind.get(id);
      if (kind === "stroke") {
        const s = this.page.strokes.find((s) => s.id === id);
        if (!s) continue;
        s.points = s.points.map((p) => {
          const r = applyAffineToPoint(p.x, p.y, params);
          return { ...p, x: r.x, y: r.y };
        });
        s.bounds = computeStrokeBounds(s);
        this.renderStroke(s);
      } else if (kind === "text") {
        const t = this.page.textObjects.find((t) => t.id === id);
        if (!t) continue;
        const center = applyAffineToPoint(t.x + t.width / 2, t.y + t.height / 2, params);
        t.width *= params.scale;
        t.height *= params.scale;
        t.rotation += params.rotation;
        t.x = center.x - t.width / 2;
        t.y = center.y - t.height / 2;
        this.renderTextObject(t);
      } else if (kind === "image") {
        const i = this.page.imageObjects.find((i) => i.id === id);
        if (!i) continue;
        const center = applyAffineToPoint(i.x + i.width / 2, i.y + i.height / 2, params);
        const view = this.imageViews.get(i.id);
        i.width *= params.scale;
        i.height *= params.scale;
        i.rotation += params.rotation;
        i.x = center.x - i.width / 2;
        i.y = center.y - i.height / 2;
        if (view) {
          view.x = i.x;
          view.y = i.y;
          view.width = i.width;
          view.height = i.height;
          view.rotation = i.rotation;
        }
      }
    }
    this.renderSelectionBox();
  }

  private commitTransform() {
    this.onChange();
    this.dragState = null;
  }

  // ---------- selection actions ----------

  deleteSelection() {
    const ids = Array.from(this.selection);
    if (ids.length === 0) return;
    const removedStrokes = this.page.strokes.filter((s) => this.selection.has(s.id));
    const removedTexts = this.page.textObjects.filter((t) => this.selection.has(t.id));
    const removedImages = this.page.imageObjects.filter((i) => this.selection.has(i.id));
    const cmd: Command = {
      do: () => {
        this.page.strokes = this.page.strokes.filter((s) => !ids.includes(s.id));
        this.page.textObjects = this.page.textObjects.filter((t) => !ids.includes(t.id));
        this.page.imageObjects = this.page.imageObjects.filter((i) => !ids.includes(i.id));
        for (const s of removedStrokes) this.removeStrokeGraphic(s.id);
        for (const t of removedTexts) this.removeTextView(t.id);
        for (const i of removedImages) this.removeImageView(i.id);
        this.onChange();
      },
      undo: () => {
        for (const s of removedStrokes) {
          this.page.strokes.push(s);
          this.renderStroke(s);
        }
        for (const t of removedTexts) {
          this.page.textObjects.push(t);
          this.renderTextObject(t);
        }
        for (const i of removedImages) {
          this.page.imageObjects.push(i);
        }
        this.onChange();
      },
    };
    this.history.push(cmd);
    this.clearSelection();
  }

  copySelection() {
    const strokes = this.page.strokes.filter((s) => this.selection.has(s.id));
    const textObjects = this.page.textObjects.filter((t) => this.selection.has(t.id));
    const imageObjects = this.page.imageObjects.filter((i) => this.selection.has(i.id));
    setClipboard({ strokes, textObjects, imageObjects });
  }

  duplicateSelection() {
    this.copySelection();
    this.pasteClipboard(24);
  }

  pasteClipboard(offset = 0) {
    const data = getClipboard();
    if (!data) return;
    const newStrokes: Stroke[] = data.strokes.map((s) => ({
      ...s,
      id: uuidv4(),
      points: s.points.map((p) => ({ ...p, x: p.x + offset, y: p.y + offset })),
      bounds: { minX: s.bounds.minX + offset, minY: s.bounds.minY + offset, maxX: s.bounds.maxX + offset, maxY: s.bounds.maxY + offset },
    }));
    const newTexts: TextObject[] = data.textObjects.map((t) => ({ ...t, id: uuidv4(), x: t.x + offset, y: t.y + offset }));
    const newImages: ImageObject[] = data.imageObjects.map((i) => ({ ...i, id: uuidv4(), x: i.x + offset, y: i.y + offset }));

    const cmd: Command = {
      do: () => {
        for (const s of newStrokes) {
          this.page.strokes.push(s);
          this.renderStroke(s);
        }
        for (const t of newTexts) {
          this.page.textObjects.push(t);
          this.renderTextObject(t);
        }
        for (const i of newImages) {
          this.page.imageObjects.push(i);
        }
        this.onChange();
      },
      undo: () => {
        const ids = new Set([...newStrokes, ...newTexts, ...newImages].map((o) => o.id));
        this.page.strokes = this.page.strokes.filter((s) => !ids.has(s.id));
        this.page.textObjects = this.page.textObjects.filter((t) => !ids.has(t.id));
        this.page.imageObjects = this.page.imageObjects.filter((i) => !ids.has(i.id));
        for (const s of newStrokes) this.removeStrokeGraphic(s.id);
        for (const t of newTexts) this.removeTextView(t.id);
        for (const i of newImages) this.removeImageView(i.id);
        this.onChange();
      },
    };
    this.history.push(cmd);
    this.setSelection([
      ...newStrokes.map((s) => ({ kind: "stroke" as const, id: s.id })),
      ...newTexts.map((t) => ({ kind: "text" as const, id: t.id })),
      ...newImages.map((i) => ({ kind: "image" as const, id: i.id })),
    ]);
  }

  // ---------- persistence / misc ----------

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const p = this.viewport.toScreen(x, y);
    const rect = this.container.getBoundingClientRect();
    return { x: p.x + rect.left, y: p.y + rect.top };
  }

  getPageData(): PageData {
    return this.page;
  }

  /** Renders the page at its natural (non-panned/zoomed) layout for a stable thumbnail, then restores the live view. */
  async exportThumbnail(maxWidth = 320): Promise<Uint8Array> {
    const prev = { x: this.viewport.x, y: this.viewport.y, sx: this.viewport.scale.x, sy: this.viewport.scale.y };
    const overlayVisible = this.overlayLayer.visible;
    this.overlayLayer.visible = false;
    const scale = maxWidth / this.page.width;
    this.viewport.position.set(0, 0);
    this.viewport.scale.set(scale, scale);

    const canvas = this.app.renderer.extract.canvas(this.viewport) as HTMLCanvasElement;

    this.overlayLayer.visible = overlayVisible;
    this.viewport.position.set(prev.x, prev.y);
    this.viewport.scale.set(prev.sx, prev.sy);

    return await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("thumbnail encode failed"));
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      }, "image/png");
    });
  }

  destroy() {
    window.removeEventListener("resize", this.handleResize);
    this.app.destroy(true, { children: true });
  }
}
