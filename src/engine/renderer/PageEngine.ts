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
import { HistoryStack } from "../history/HistoryStack";
import { strokeToPolygon } from "../stroke/outline";
import { computeStrokeBounds, distanceToStroke, pointInBounds } from "../stroke/bounds";
import { recognizeShape, shapeToPoints } from "../stroke/shapeRecognition";
import { pointInPolygon, unionBounds } from "../selection/hitTest";
import { applyAffineToPoint } from "../selection/transform";
import { getClipboard, setClipboard } from "../selection/clipboard";
import { drawTemplate } from "./templates";
import { loadImageElement } from "../imageLoad";
import { tween, type TweenHandle } from "../../lib/tween";

const MARKER_ALPHA = 0.35;
/**
 * Selection affordances on the sheet. A muted slate rather than a saturated
 * blue, to match the neutral chrome, but still distinct from ink on cream.
 */
const SELECT_COLOR = 0x5a6270;
/** Keeps text drawn on the sheet in the same face as the rest of the app. */
const TEXT_FONT_FAMILY = "Outfit, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const ERASER_RADIUS = 14;
const PALM_REJECTION_WINDOW_MS = 1000;
/** Vertical gap between sheets, in page units. */
const PAGE_GAP = 48;
/** Extra screen-heights of pages kept mounted above/below the viewport. */
const MOUNT_MARGIN_SCREENS = 0.75;

export interface PageEngineOptions {
  container: HTMLDivElement;
  pages: PageData[];
  onChange: (pageId: string) => void;
  onSelectionChange: (sel: SelectionRef[]) => void;
  onRequestTextEdit: (obj: TextObject, screenX: number, screenY: number) => void;
  onVisiblePageChange: (pageId: string) => void;
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * One sheet in the continuous scroll. Display objects are created on mount and
 * destroyed on unmount; `data` and the cached PDF/image textures survive so a
 * remount is cheap.
 */
interface EnginePage {
  data: PageData;
  offsetX: number;
  offsetY: number;
  root: Container;
  bg: Graphics;
  pdf: Container;
  ink: Container;
  objects: Container;
  strokeGraphics: Map<string, Graphics>;
  textViews: Map<string, Container>;
  imageViews: Map<string, Sprite>;
  pdfCanvas: HTMLCanvasElement | null;
  imageTextures: Map<string, Texture>;
  mounted: boolean;
}

/**
 * Renders a whole notebook as one vertically scrollable strip of sheets, the
 * way GoodNotes does. Pages outside the viewport are unmounted to keep GPU
 * memory flat regardless of notebook length, and switching pages is a scroll
 * rather than a teardown, so there is no flicker.
 */
export class PageEngine {
  app: Application;
  viewport!: Viewport;
  history = new HistoryStack();

  private container: HTMLDivElement;
  private pages: EnginePage[] = [];
  private pagesLayer = new Container();
  private overlayLayer = new Container();
  private worldWidth = 1;
  private worldHeight = 1;

  private tool: ToolId = "pen";
  private color = "#1c1c1e";
  private width = 3;
  private shapeMode = false;

  private drawing = false;
  private activePointerId: number | null = null;
  private lastPenActivityAt = 0;
  private currentPoints: StrokePoint[] = [];
  private activePage: EnginePage | null = null;
  private previewGraphic: Graphics | null = null;

  private lassoActive = false;
  private lassoPoints: { x: number; y: number }[] = [];
  private lassoGraphic: Graphics | null = null;

  private selection = new Set<string>();
  private selectionKind = new Map<string, "stroke" | "text" | "image">();
  private selectionPage: EnginePage | null = null;
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

  private pendingErase: { page: EnginePage; strokes: Stroke[] } | null = null;
  private lastReportedVisiblePage: string | null = null;
  private clamping = false;
  private viewTween: TweenHandle | null = null;

  private onChange: (pageId: string) => void;
  private onSelectionChange: (sel: SelectionRef[]) => void;
  private onRequestTextEdit: (obj: TextObject, screenX: number, screenY: number) => void;
  private onVisiblePageChange: (pageId: string) => void;

  private ready: Promise<void>;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(opts: PageEngineOptions) {
    this.container = opts.container;
    this.onChange = opts.onChange;
    this.onSelectionChange = opts.onSelectionChange;
    this.onRequestTextEdit = opts.onRequestTextEdit;
    this.onVisiblePageChange = opts.onVisiblePageChange;
    this.app = new Application();
    this.ready = this.init(opts.pages);
  }

  private async init(pageData: PageData[]) {
    const rect = this.container.getBoundingClientRect();
    await this.app.init({
      width: Math.max(rect.width, 100),
      height: Math.max(rect.height, 100),
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      eventMode: "static",
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.container.appendChild(this.app.canvas);

    this.viewport = new Viewport({
      screenWidth: this.app.screen.width,
      screenHeight: this.app.screen.height,
      worldWidth: 1,
      worldHeight: 1,
      events: this.app.renderer.events,
    });
    this.app.stage.addChild(this.viewport);
    // Touch gestures come from the plugins; the wheel is handled manually below
    // because the plugin's non-zoom mode does not pan the way this layout needs.
    this.viewport.drag().pinch().decelerate({ friction: 0.94 });
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.viewport.addChild(this.pagesLayer, this.overlayLayer);
    this.viewport.eventMode = "static";

    this.setPages(pageData, { keepView: false });

    this.viewport.on("pointerdown", this.onPointerDown);
    this.viewport.on("pointermove", this.onPointerMove);
    this.viewport.on("pointerup", this.onPointerUp);
    this.viewport.on("pointerupoutside", this.onPointerUp);
    this.viewport.on("moved", this.onViewportMoved);
    this.viewport.on("zoomed", this.onViewportMoved);

    // Observing the container catches sidebar toggles and orientation changes,
    // which a window resize listener alone would miss.
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();
    this.fitWidth();
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  // ---------- wheel: scroll by default, zoom with a modifier ----------

  /**
   * Plain wheel and two-finger trackpad scroll the strip of pages; ctrl/cmd
   * plus wheel — which is also what a trackpad pinch emits — zooms about the
   * cursor. Matches the reference app, where scrolling is the primary gesture.
   */
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    // deltaMode 1 is lines, 2 is pages; normalise everything to pixels.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewport.screenHeight : 1;

    if (e.ctrlKey || e.metaKey) {
      const before = this.viewport.toWorld(sx, sy);
      const factor = Math.exp((-e.deltaY * unit) / 400);
      const next = Math.min(8, Math.max(0.1, this.viewport.scale.x * factor));
      this.viewport.scale.set(next);
      // Keep the point under the cursor pinned across the scale change.
      this.viewport.position.set(sx - before.x * next, sy - before.y * next);
    } else {
      const scale = this.viewport.scale.y || 1;
      this.viewport.top += (e.deltaY * unit) / scale;
      if (e.deltaX) this.viewport.left += (e.deltaX * unit) / scale;
    }

    this.clampView();
    this.redrawMountedBackgrounds();
    this.updateMountedPages();
    this.reportVisiblePage();
  };

  /** Keeps the sheets from being scrolled entirely out of view. */
  private clampView() {
    const visibleH = this.viewport.screenHeightInWorldPixels;
    const visibleW = this.viewport.screenWidthInWorldPixels;
    const slackY = visibleH * 0.25;
    const maxTop = Math.max(-slackY, this.worldHeight - visibleH + slackY);
    this.viewport.top = Math.min(Math.max(this.viewport.top, -slackY), maxTop);

    if (visibleW >= this.worldWidth) {
      // Sheet narrower than the view: centre it rather than letting it drift.
      this.viewport.left = (this.worldWidth - visibleW) / 2;
    } else {
      this.viewport.left = Math.min(Math.max(this.viewport.left, 0), this.worldWidth - visibleW);
    }
  }

  // ---------- layout ----------

  /** Replaces the page set (add/remove/reorder) without tearing down the renderer. */
  setPages(pageData: PageData[], opts: { keepView?: boolean } = {}) {
    const keepView = opts.keepView ?? true;
    const prevTop = keepView ? this.viewport.top : 0;
    const prevScale = keepView ? this.viewport.scale.x : null;

    const existing = new Map(this.pages.map((p) => [p.data.id, p]));
    const next: EnginePage[] = [];

    for (const data of pageData) {
      const reused = existing.get(data.id);
      if (reused) {
        reused.data = data;
        existing.delete(data.id);
        next.push(reused);
      } else {
        next.push(this.createPage(data));
      }
    }
    // Anything left over was removed from the notebook.
    for (const stale of existing.values()) {
      this.unmountPage(stale);
      stale.root.destroy({ children: true });
    }

    this.pages = next;
    this.relayout();

    if (prevScale !== null) {
      this.viewport.scale.set(prevScale);
      this.viewport.top = Math.min(prevTop, Math.max(0, this.worldHeight - this.viewport.screenHeightInWorldPixels));
    }
    this.updateMountedPages();
  }

  private createPage(data: PageData): EnginePage {
    const root = new Container();
    const bg = new Graphics();
    const pdf = new Container();
    const ink = new Container();
    const objects = new Container();
    root.addChild(bg, pdf, ink, objects);
    root.visible = false;
    return {
      data,
      offsetX: 0,
      offsetY: 0,
      root,
      bg,
      pdf,
      ink,
      objects,
      strokeGraphics: new Map(),
      textViews: new Map(),
      imageViews: new Map(),
      pdfCanvas: null,
      imageTextures: new Map(),
      mounted: false,
    };
  }

  private relayout() {
    this.worldWidth = Math.max(1, ...this.pages.map((p) => p.data.width));
    let y = 0;
    for (const page of this.pages) {
      page.offsetX = (this.worldWidth - page.data.width) / 2;
      page.offsetY = y;
      page.root.position.set(page.offsetX, page.offsetY);
      if (page.root.parent !== this.pagesLayer) this.pagesLayer.addChild(page.root);
      y += page.data.height + PAGE_GAP;
    }
    this.worldHeight = Math.max(1, y - PAGE_GAP);

    this.viewport.worldWidth = this.worldWidth;
    this.viewport.worldHeight = this.worldHeight;
    this.viewport.hitArea = new Rectangle(
      -this.worldWidth,
      -this.worldHeight,
      this.worldWidth * 3,
      this.worldHeight * 3,
    );
  }

  private handleResize = () => {
    const rect = this.container.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.app.renderer.resize(rect.width, rect.height);
    this.viewport.resize(rect.width, rect.height, this.worldWidth, this.worldHeight);
    this.redrawMountedBackgrounds();
    this.updateMountedPages();
  };

  /** Sheet spans the viewport width; scrolling is vertical, as in the reference app. */
  fitWidth(opts: { animate?: boolean } = {}) {
    const target = this.viewport.screenWidth / this.worldWidth;
    this.viewTween?.cancel();

    if (!opts.animate) {
      this.viewport.scale.set(target);
      this.viewport.moveCorner(0, 0);
      this.redrawMountedBackgrounds();
      this.updateMountedPages();
      return;
    }

    const fromScale = this.viewport.scale.x;
    const fromTop = this.viewport.top;
    const fromLeft = this.viewport.left;
    this.viewTween = tween({
      duration: 340,
      onUpdate: (t) => {
        const scale = fromScale + (target - fromScale) * t;
        this.viewport.scale.set(scale);
        this.viewport.top = fromTop * (1 - t);
        this.viewport.left = fromLeft * (1 - t);
        this.clampView();
        this.redrawMountedBackgrounds();
        this.updateMountedPages();
      },
      onDone: () => {
        this.viewTween = null;
      },
    });
  }

  // ---------- virtualization ----------

  private onViewportMoved = () => {
    // Writing top/left re-emits "moved"; the guard keeps that from recursing.
    if (!this.clamping) {
      this.clamping = true;
      this.clampView();
      this.clamping = false;
    }
    this.updateMountedPages();
    this.reportVisiblePage();
  };

  private updateMountedPages() {
    if (this.pages.length === 0) return;
    const margin = this.viewport.screenHeightInWorldPixels * MOUNT_MARGIN_SCREENS;
    const top = this.viewport.top - margin;
    const bottom = this.viewport.bottom + margin;

    for (const page of this.pages) {
      const pageTop = page.offsetY;
      const pageBottom = page.offsetY + page.data.height;
      const shouldMount = pageBottom >= top && pageTop <= bottom;
      if (shouldMount && !page.mounted) this.mountPage(page);
      else if (!shouldMount && page.mounted) this.unmountPage(page);
    }
  }

  private mountPage(page: EnginePage) {
    page.mounted = true;
    page.root.visible = true;
    this.drawPageBackground(page);
    if (page.pdfCanvas) this.attachPdfCanvas(page, page.pdfCanvas);
    for (const stroke of page.data.strokes) this.renderStroke(page, stroke);
    for (const t of page.data.textObjects) this.renderTextObject(page, t);
    for (const img of page.data.imageObjects) {
      const tex = page.imageTextures.get(img.id);
      if (tex) this.renderImageObject(page, img, tex);
    }
  }

  private unmountPage(page: EnginePage) {
    page.mounted = false;
    page.root.visible = false;
    for (const g of page.strokeGraphics.values()) g.destroy();
    page.strokeGraphics.clear();
    for (const v of page.textViews.values()) v.destroy({ children: true });
    page.textViews.clear();
    for (const v of page.imageViews.values()) v.destroy();
    page.imageViews.clear();
    page.pdf.removeChildren();
    page.bg.clear();
  }

  private reportVisiblePage() {
    const centerY = this.viewport.center.y;
    let best: EnginePage | null = null;
    let bestDist = Infinity;
    for (const page of this.pages) {
      const mid = page.offsetY + page.data.height / 2;
      const d = Math.abs(mid - centerY);
      if (d < bestDist) {
        bestDist = d;
        best = page;
      }
    }
    if (best && best.data.id !== this.lastReportedVisiblePage) {
      this.lastReportedVisiblePage = best.data.id;
      this.onVisiblePageChange(best.data.id);
    }
  }

  /**
   * Glides a page to the top of the viewport — what a thumbnail tap does.
   * Animated rather than snapped so the jump between distant pages stays
   * legible; `immediate` is used when restoring a saved position on open.
   */
  scrollToPage(pageId: string, opts: { immediate?: boolean } = {}) {
    const page = this.pages.find((p) => p.data.id === pageId);
    if (!page) return;
    this.viewTween?.cancel();
    this.viewport.plugins.get("decelerate")?.reset();
    this.lastReportedVisiblePage = pageId;

    const from = this.viewport.top;
    const to = page.offsetY;
    if (opts.immediate || Math.abs(to - from) < 1) {
      this.viewport.top = to;
      this.clampView();
      this.redrawMountedBackgrounds();
      this.updateMountedPages();
      return;
    }

    // Longer trips get a little more time, but never a sluggish amount.
    const distanceScreens = Math.abs(to - from) / Math.max(this.viewport.screenHeightInWorldPixels, 1);
    const duration = Math.min(620, 260 + distanceScreens * 120);
    this.viewTween = tween({
      duration,
      onUpdate: (t) => {
        this.viewport.top = from + (to - from) * t;
        this.clampView();
        this.updateMountedPages();
      },
      onDone: () => {
        this.viewTween = null;
        this.redrawMountedBackgrounds();
      },
    });
  }

  // ---------- background ----------

  private drawPageBackground(page: EnginePage) {
    drawTemplate(
      page.bg,
      page.data.template,
      page.data.width,
      page.data.height,
      1 / Math.max(this.viewport.scale.x, 0.0001),
    );
  }

  private redrawMountedBackgrounds() {
    for (const page of this.pages) if (page.mounted) this.drawPageBackground(page);
  }

  setPdfBackground(pageId: string, canvas: HTMLCanvasElement | null) {
    const page = this.pages.find((p) => p.data.id === pageId);
    if (!page) return;
    page.pdfCanvas = canvas;
    if (page.mounted) {
      page.pdf.removeChildren();
      if (canvas) this.attachPdfCanvas(page, canvas);
    }
  }

  private attachPdfCanvas(page: EnginePage, canvas: HTMLCanvasElement) {
    const sprite = new Sprite(Texture.from(canvas));
    sprite.width = page.data.width;
    sprite.height = page.data.height;
    page.pdf.addChild(sprite);
  }

  registerLoadedImageTexture(pageId: string, objectId: string, texture: Texture) {
    const page = this.pages.find((p) => p.data.id === pageId);
    if (!page) return;
    page.imageTextures.set(objectId, texture);
    const obj = page.data.imageObjects.find((i) => i.id === objectId);
    if (obj && page.mounted) this.renderImageObject(page, obj, texture);
  }

  /** Page ids that still need their PDF/image assets loaded by the caller. */
  getPageIds(): string[] {
    return this.pages.map((p) => p.data.id);
  }

  getPageData(pageId: string): PageData | null {
    return this.pages.find((p) => p.data.id === pageId)?.data ?? null;
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
    // Single-pointer drag would fight the drawing tools; two-finger pan still
    // works through the pinch plugin, and the wheel keeps working everywhere.
    const isDrawTool = this.tool === "pen" || this.tool === "marker" || this.tool === "eraser" || this.tool === "lasso";
    if (isDrawTool) this.viewport.plugins.pause("drag");
    else this.viewport.plugins.resume("drag");
  }

  // ---------- coordinate helpers ----------

  private pageAtWorld(worldX: number, worldY: number): EnginePage | null {
    for (const page of this.pages) {
      const top = page.offsetY;
      const bottom = page.offsetY + page.data.height;
      if (worldY >= top && worldY <= bottom) {
        const left = page.offsetX;
        const right = page.offsetX + page.data.width;
        if (worldX >= left && worldX <= right) return page;
        return null;
      }
    }
    return null;
  }

  /** Nearest page even if the point sits in a gap — used so a stroke started slightly off-sheet still lands somewhere sensible. */
  private nearestPage(worldY: number): EnginePage | null {
    let best: EnginePage | null = null;
    let bestDist = Infinity;
    for (const page of this.pages) {
      const top = page.offsetY;
      const bottom = page.offsetY + page.data.height;
      const d = worldY < top ? top - worldY : worldY > bottom ? worldY - bottom : 0;
      if (d < bestDist) {
        bestDist = d;
        best = page;
      }
    }
    return best;
  }

  private toLocal(page: EnginePage, worldX: number, worldY: number): { x: number; y: number } {
    return { x: worldX - page.offsetX, y: worldY - page.offsetY };
  }

  // ---------- pointer pipeline ----------

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

  private localStrokePoint(page: EnginePage, e: FederatedPointerEvent): StrokePoint {
    const world = this.viewport.toWorld(e.global);
    const local = this.toLocal(page, world.x, world.y);
    const native = e.nativeEvent as PointerEvent;
    return {
      x: local.x,
      y: local.y,
      pressure: native.pressure > 0 ? native.pressure : 0.5,
      tiltX: native.tiltX ?? 0,
      tiltY: native.tiltY ?? 0,
    };
  }

  private onPointerDown = (e: FederatedPointerEvent) => {
    if (this.activePointerId !== null) return;
    const world = this.viewport.toWorld(e.global);

    if (this.tool === "text") {
      const page = this.pageAtWorld(world.x, world.y);
      if (!page) return;
      const local = this.toLocal(page, world.x, world.y);
      const existing = page.data.textObjects.find(
        (t) => local.x >= t.x && local.x <= t.x + t.width && local.y >= t.y && local.y <= t.y + t.height,
      );
      const obj = existing ?? this.addTextObjectAt(page, local.x, local.y);
      const screen = this.worldToScreen(page.offsetX + obj.x, page.offsetY + obj.y);
      this.onRequestTextEdit(obj, screen.x, screen.y);
      return;
    }

    if (this.tool === "pen" || this.tool === "marker" || this.tool === "eraser") {
      if (this.isPalmTouch(e)) return;
      const page = this.pageAtWorld(world.x, world.y) ?? this.nearestPage(world.y);
      if (!page) return;
      this.activePointerId = e.pointerId;
      this.drawing = true;
      this.activePage = page;
      if (this.tool === "eraser") {
        this.pendingErase = { page, strokes: [] };
        const local = this.toLocal(page, world.x, world.y);
        this.eraseAt(page, local.x, local.y);
      } else {
        this.currentPoints = [this.localStrokePoint(page, e)];
      }
      return;
    }

    if (this.tool === "lasso") {
      if (this.isPalmTouch(e)) return;
      const handle = this.hitTestSelectionHandle(world.x, world.y);
      if (handle) {
        this.activePointerId = e.pointerId;
        this.beginTransform(handle, world.x, world.y);
        return;
      }
      const page = this.pageAtWorld(world.x, world.y);
      if (!page) return;
      const hit = this.hitTestObjectAt(page, world.x, world.y);
      if (hit) {
        this.activePointerId = e.pointerId;
        if (!this.selection.has(hit.id)) this.setSelection(page, [hit]);
        this.beginTransform("move", world.x, world.y);
        return;
      }
      this.activePointerId = e.pointerId;
      this.lassoActive = true;
      this.activePage = page;
      this.lassoPoints = [{ x: world.x, y: world.y }];
      this.clearSelection();
      return;
    }
  };

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;
    const world = this.viewport.toWorld(e.global);

    if (this.drawing && this.activePage) {
      if (this.tool === "eraser") {
        const local = this.toLocal(this.activePage, world.x, world.y);
        this.eraseAt(this.activePage, local.x, local.y);
      } else {
        this.currentPoints.push(this.localStrokePoint(this.activePage, e));
        this.renderPreview(this.activePage);
      }
      return;
    }

    if (this.lassoActive) {
      this.lassoPoints.push({ x: world.x, y: world.y });
      this.renderLassoPreview();
      return;
    }

    if (this.dragState) this.updateTransform(world.x, world.y);
  };

  private onPointerUp = (e: FederatedPointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;

    if (this.drawing) {
      this.drawing = false;
      if (this.tool === "eraser") this.commitEraseHistory();
      else if (this.activePage) this.finishStroke(this.activePage);
      this.clearPreview();
      this.activePage = null;
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

  private renderPreview(page: EnginePage) {
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
    this.previewGraphic.position.set(page.offsetX, page.offsetY);
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

  private finishStroke(page: EnginePage) {
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

    this.history.push({
      do: () => {
        page.data.strokes.push(stroke);
        if (page.mounted) this.renderStroke(page, stroke);
        this.onChange(page.data.id);
      },
      undo: () => {
        page.data.strokes = page.data.strokes.filter((s) => s.id !== stroke.id);
        this.removeStrokeGraphic(page, stroke.id);
        this.onChange(page.data.id);
      },
    });
  }

  private renderStroke(page: EnginePage, stroke: Stroke) {
    this.removeStrokeGraphic(page, stroke.id);
    const g = this.buildStrokeGraphic(stroke);
    page.strokeGraphics.set(stroke.id, g);
    page.ink.addChild(g);
  }

  private removeStrokeGraphic(page: EnginePage, id: string) {
    const g = page.strokeGraphics.get(id);
    if (g) {
      g.destroy();
      page.strokeGraphics.delete(id);
    }
  }

  // ---------- eraser ----------

  private eraseAt(page: EnginePage, x: number, y: number) {
    const toRemove: Stroke[] = [];
    for (const stroke of page.data.strokes) {
      if (!pointInBounds(x, y, stroke.bounds)) continue;
      if (distanceToStroke(x, y, stroke) <= ERASER_RADIUS) toRemove.push(stroke);
    }
    if (toRemove.length === 0) return;
    const ids = new Set(toRemove.map((s) => s.id));
    page.data.strokes = page.data.strokes.filter((s) => !ids.has(s.id));
    for (const s of toRemove) this.removeStrokeGraphic(page, s.id);
    if (this.pendingErase) this.pendingErase.strokes.push(...toRemove);
    this.onChange(page.data.id);
  }

  /** Erasing already happened per pointer-move; this records one undo step for the gesture. */
  private commitEraseHistory() {
    const pending = this.pendingErase;
    this.pendingErase = null;
    if (!pending || pending.strokes.length === 0) return;
    const { page, strokes } = pending;
    this.history.pushExecuted({
      do: () => {
        const ids = new Set(strokes.map((s) => s.id));
        page.data.strokes = page.data.strokes.filter((s) => !ids.has(s.id));
        for (const s of strokes) this.removeStrokeGraphic(page, s.id);
        this.onChange(page.data.id);
      },
      undo: () => {
        for (const s of strokes) {
          page.data.strokes.push(s);
          if (page.mounted) this.renderStroke(page, s);
        }
        this.onChange(page.data.id);
      },
    });
  }

  // ---------- text objects ----------

  private addTextObjectAt(page: EnginePage, localX: number, localY: number): TextObject {
    const obj: TextObject = {
      id: uuidv4(),
      x: localX,
      y: localY,
      width: 220,
      height: 60,
      rotation: 0,
      text: "",
      fontSize: 24,
      fontFamily: TEXT_FONT_FAMILY,
      color: this.color,
    };
    this.history.push({
      do: () => {
        page.data.textObjects.push(obj);
        if (page.mounted) this.renderTextObject(page, obj);
        this.onChange(page.data.id);
      },
      undo: () => {
        page.data.textObjects = page.data.textObjects.filter((t) => t.id !== obj.id);
        this.removeTextView(page, obj.id);
        this.onChange(page.data.id);
      },
    });
    return obj;
  }

  commitTextEdit(id: string, text: string, fontSize: number, color: string) {
    for (const page of this.pages) {
      const obj = page.data.textObjects.find((t) => t.id === id);
      if (!obj) continue;
      if (text.trim().length === 0) {
        page.data.textObjects = page.data.textObjects.filter((t) => t.id !== id);
        this.removeTextView(page, id);
      } else {
        obj.text = text;
        obj.fontSize = fontSize;
        obj.color = color;
        if (page.mounted) this.renderTextObject(page, obj);
      }
      this.onChange(page.data.id);
      return;
    }
  }

  private renderTextObject(page: EnginePage, obj: TextObject) {
    this.removeTextView(page, obj.id);
    if (!obj.text) return;
    const wrap = new Container();
    const textEl = new Text({
      text: obj.text,
      style: {
        fontFamily: obj.fontFamily,
        fontSize: obj.fontSize,
        fill: obj.color,
        wordWrap: true,
        wordWrapWidth: obj.width,
      },
    });
    wrap.addChild(textEl);
    wrap.position.set(obj.x, obj.y);
    wrap.rotation = obj.rotation;
    page.textViews.set(obj.id, wrap);
    page.objects.addChild(wrap);
  }

  private removeTextView(page: EnginePage, id: string) {
    const v = page.textViews.get(id);
    if (v) {
      v.destroy({ children: true });
      page.textViews.delete(id);
    }
  }

  // ---------- image objects ----------

  async addImageObjectFromBytes(pageId: string, bytes: Uint8Array, assetFile: string): Promise<void> {
    const page = this.pages.find((p) => p.data.id === pageId);
    if (!page) return;
    const img = await loadImageElement(bytes);
    const maxDim = Math.min(page.data.width, page.data.height) * 0.5;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = img.width * scale;
    const height = img.height * scale;
    const obj: ImageObject = {
      id: uuidv4(),
      x: (page.data.width - width) / 2,
      y: (page.data.height - height) / 2,
      width,
      height,
      rotation: 0,
      assetFile,
    };
    const texture = Texture.from(img);
    page.imageTextures.set(obj.id, texture);
    this.history.push({
      do: () => {
        page.data.imageObjects.push(obj);
        if (page.mounted) this.renderImageObject(page, obj, texture);
        this.onChange(page.data.id);
      },
      undo: () => {
        page.data.imageObjects = page.data.imageObjects.filter((i) => i.id !== obj.id);
        this.removeImageView(page, obj.id);
        this.onChange(page.data.id);
      },
    });
  }

  private renderImageObject(page: EnginePage, obj: ImageObject, texture: Texture) {
    this.removeImageView(page, obj.id);
    const sprite = new Sprite(texture);
    sprite.x = obj.x;
    sprite.y = obj.y;
    sprite.width = obj.width;
    sprite.height = obj.height;
    sprite.rotation = obj.rotation;
    page.imageViews.set(obj.id, sprite);
    page.objects.addChild(sprite);
  }

  private removeImageView(page: EnginePage, id: string) {
    const v = page.imageViews.get(id);
    if (v) {
      v.destroy();
      page.imageViews.delete(id);
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
        .fill({ color: SELECT_COLOR, alpha: 0.14 })
        .stroke({ width: 2 / this.viewport.scale.x, color: SELECT_COLOR });
    }
    this.overlayLayer.addChild(this.lassoGraphic);
  }

  private finishLasso() {
    if (this.lassoGraphic) {
      this.lassoGraphic.destroy();
      this.lassoGraphic = null;
    }
    const page = this.activePage;
    this.activePage = null;
    if (this.lassoPoints.length < 3 || !page) {
      this.lassoPoints = [];
      return;
    }
    // Lasso is captured in world space; compare against page-local geometry.
    const polygon = this.lassoPoints.map((p) => this.toLocal(page, p.x, p.y));
    this.lassoPoints = [];

    const refs: SelectionRef[] = [];
    for (const s of page.data.strokes) {
      const cx = (s.bounds.minX + s.bounds.maxX) / 2;
      const cy = (s.bounds.minY + s.bounds.maxY) / 2;
      if (pointInPolygon(cx, cy, polygon)) refs.push({ kind: "stroke", id: s.id });
    }
    for (const t of page.data.textObjects) {
      if (pointInPolygon(t.x + t.width / 2, t.y + t.height / 2, polygon)) refs.push({ kind: "text", id: t.id });
    }
    for (const i of page.data.imageObjects) {
      if (pointInPolygon(i.x + i.width / 2, i.y + i.height / 2, polygon)) refs.push({ kind: "image", id: i.id });
    }
    this.setSelection(page, refs);
  }

  private hitTestObjectAt(page: EnginePage, worldX: number, worldY: number): SelectionRef | null {
    const { x, y } = this.toLocal(page, worldX, worldY);
    for (let i = page.data.imageObjects.length - 1; i >= 0; i--) {
      const o = page.data.imageObjects[i];
      if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height) return { kind: "image", id: o.id };
    }
    for (let i = page.data.textObjects.length - 1; i >= 0; i--) {
      const o = page.data.textObjects[i];
      if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height) return { kind: "text", id: o.id };
    }
    for (let i = page.data.strokes.length - 1; i >= 0; i--) {
      const s = page.data.strokes[i];
      if (pointInBounds(x, y, s.bounds) && distanceToStroke(x, y, s) <= Math.max(s.width, 8)) {
        return { kind: "stroke", id: s.id };
      }
    }
    return null;
  }

  private hitTestSelectionHandle(worldX: number, worldY: number): "scale" | "rotate" | null {
    const tolerance = 16 / this.viewport.scale.x;
    if (this.scaleHandleWorld && Math.hypot(worldX - this.scaleHandleWorld.x, worldY - this.scaleHandleWorld.y) <= tolerance) {
      return "scale";
    }
    if (this.rotateHandleWorld && Math.hypot(worldX - this.rotateHandleWorld.x, worldY - this.rotateHandleWorld.y) <= tolerance) {
      return "rotate";
    }
    return null;
  }

  // ---------- selection state ----------

  private setSelection(page: EnginePage, refs: SelectionRef[]) {
    this.selectionPage = page;
    this.selection = new Set(refs.map((r) => r.id));
    this.selectionKind = new Map(refs.map((r) => [r.id, r.kind]));
    this.renderSelectionBox();
    this.onSelectionChange(refs);
  }

  clearSelection() {
    this.selection.clear();
    this.selectionKind.clear();
    this.selectionPage = null;
    this.scaleHandleWorld = null;
    this.rotateHandleWorld = null;
    if (this.selectionBox) {
      this.selectionBox.destroy();
      this.selectionBox = null;
    }
    this.onSelectionChange([]);
  }

  /** Selection bounds in page-local coordinates. */
  private getSelectionBounds(): Bounds | null {
    const page = this.selectionPage;
    if (!page) return null;
    const boxes: Bounds[] = [];
    for (const id of this.selection) {
      const kind = this.selectionKind.get(id);
      if (kind === "stroke") {
        const s = page.data.strokes.find((s) => s.id === id);
        if (s) boxes.push(s.bounds);
      } else if (kind === "text") {
        const t = page.data.textObjects.find((t) => t.id === id);
        if (t) boxes.push({ minX: t.x, minY: t.y, maxX: t.x + t.width, maxY: t.y + t.height });
      } else if (kind === "image") {
        const i = page.data.imageObjects.find((i) => i.id === id);
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
    const page = this.selectionPage;
    const bounds = this.getSelectionBounds();
    if (!bounds || !page) {
      this.scaleHandleWorld = null;
      this.rotateHandleWorld = null;
      return;
    }
    const g = new Graphics();
    const inv = 1 / this.viewport.scale.x;
    const ox = page.offsetX;
    const oy = page.offsetY;
    g.rect(ox + bounds.minX, oy + bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY).stroke({
      width: 2 * inv,
      color: SELECT_COLOR,
    });
    const handleSize = 10 * inv;
    this.scaleHandleWorld = { x: ox + bounds.maxX, y: oy + bounds.maxY };
    this.rotateHandleWorld = { x: ox + (bounds.minX + bounds.maxX) / 2, y: oy + bounds.minY - 24 * inv };
    g.rect(this.scaleHandleWorld.x - handleSize / 2, this.scaleHandleWorld.y - handleSize / 2, handleSize, handleSize).fill(
      SELECT_COLOR,
    );
    g.circle(this.rotateHandleWorld.x, this.rotateHandleWorld.y, handleSize / 2).fill(SELECT_COLOR);
    this.selectionBox = g;
    this.overlayLayer.addChild(g);
  }

  private beginTransform(mode: "move" | "scale" | "rotate", worldX: number, worldY: number) {
    const page = this.selectionPage;
    const bounds = this.getSelectionBounds();
    if (!bounds || !page) return;
    this.dragState = {
      mode,
      startX: worldX,
      startY: worldY,
      pivotX: page.offsetX + (bounds.minX + bounds.maxX) / 2,
      pivotY: page.offsetY + (bounds.minY + bounds.maxY) / 2,
    };
  }

  /** Applies only the delta since the last frame about the gesture's fixed pivot. */
  private updateTransform(worldX: number, worldY: number) {
    if (!this.dragState) return;
    const { mode, startX, startY, pivotX, pivotY } = this.dragState;

    if (mode === "move") {
      this.applyLiveTransform({ dx: worldX - startX, dy: worldY - startY, scale: 1, rotation: 0, pivotX, pivotY });
    } else if (mode === "scale") {
      const startDist = Math.hypot(startX - pivotX, startY - pivotY) || 1;
      const currentDist = Math.hypot(worldX - pivotX, worldY - pivotY) || 1;
      this.applyLiveTransform({ dx: 0, dy: 0, scale: currentDist / startDist, rotation: 0, pivotX, pivotY });
    } else {
      const a0 = Math.atan2(startY - pivotY, startX - pivotX);
      const a1 = Math.atan2(worldY - pivotY, worldX - pivotX);
      this.applyLiveTransform({ dx: 0, dy: 0, scale: 1, rotation: a1 - a0, pivotX, pivotY });
    }

    this.dragState.startX = worldX;
    this.dragState.startY = worldY;
  }

  private applyLiveTransform(p: {
    dx: number;
    dy: number;
    scale: number;
    rotation: number;
    pivotX: number;
    pivotY: number;
  }) {
    const page = this.selectionPage;
    if (!page) return;
    // Pivot arrives in world space; the geometry it transforms is page-local.
    const params = {
      dx: p.dx,
      dy: p.dy,
      scale: p.scale,
      rotation: p.rotation,
      pivotX: p.pivotX - page.offsetX,
      pivotY: p.pivotY - page.offsetY,
    };

    for (const id of this.selection) {
      const kind = this.selectionKind.get(id);
      if (kind === "stroke") {
        const s = page.data.strokes.find((s) => s.id === id);
        if (!s) continue;
        s.points = s.points.map((pt) => {
          const r = applyAffineToPoint(pt.x, pt.y, params);
          return { ...pt, x: r.x, y: r.y };
        });
        s.bounds = computeStrokeBounds(s);
        if (page.mounted) this.renderStroke(page, s);
      } else if (kind === "text") {
        const t = page.data.textObjects.find((t) => t.id === id);
        if (!t) continue;
        const c = applyAffineToPoint(t.x + t.width / 2, t.y + t.height / 2, params);
        t.width *= params.scale;
        t.height *= params.scale;
        t.rotation += params.rotation;
        t.x = c.x - t.width / 2;
        t.y = c.y - t.height / 2;
        if (page.mounted) this.renderTextObject(page, t);
      } else if (kind === "image") {
        const i = page.data.imageObjects.find((i) => i.id === id);
        if (!i) continue;
        const c = applyAffineToPoint(i.x + i.width / 2, i.y + i.height / 2, params);
        i.width *= params.scale;
        i.height *= params.scale;
        i.rotation += params.rotation;
        i.x = c.x - i.width / 2;
        i.y = c.y - i.height / 2;
        const view = page.imageViews.get(i.id);
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
    if (this.selectionPage) this.onChange(this.selectionPage.data.id);
    this.dragState = null;
  }

  // ---------- selection actions ----------

  deleteSelection() {
    const page = this.selectionPage;
    if (!page || this.selection.size === 0) return;
    const ids = Array.from(this.selection);
    const strokes = page.data.strokes.filter((s) => ids.includes(s.id));
    const texts = page.data.textObjects.filter((t) => ids.includes(t.id));
    const images = page.data.imageObjects.filter((i) => ids.includes(i.id));

    this.history.push({
      do: () => {
        page.data.strokes = page.data.strokes.filter((s) => !ids.includes(s.id));
        page.data.textObjects = page.data.textObjects.filter((t) => !ids.includes(t.id));
        page.data.imageObjects = page.data.imageObjects.filter((i) => !ids.includes(i.id));
        for (const s of strokes) this.removeStrokeGraphic(page, s.id);
        for (const t of texts) this.removeTextView(page, t.id);
        for (const i of images) this.removeImageView(page, i.id);
        this.onChange(page.data.id);
      },
      undo: () => {
        for (const s of strokes) {
          page.data.strokes.push(s);
          if (page.mounted) this.renderStroke(page, s);
        }
        for (const t of texts) {
          page.data.textObjects.push(t);
          if (page.mounted) this.renderTextObject(page, t);
        }
        for (const i of images) {
          page.data.imageObjects.push(i);
          const tex = page.imageTextures.get(i.id);
          if (tex && page.mounted) this.renderImageObject(page, i, tex);
        }
        this.onChange(page.data.id);
      },
    });
    this.clearSelection();
  }

  copySelection() {
    const page = this.selectionPage;
    if (!page) return;
    setClipboard({
      strokes: page.data.strokes.filter((s) => this.selection.has(s.id)),
      textObjects: page.data.textObjects.filter((t) => this.selection.has(t.id)),
      imageObjects: page.data.imageObjects.filter((i) => this.selection.has(i.id)),
    });
  }

  duplicateSelection() {
    this.copySelection();
    this.pasteClipboard(24);
  }

  /** Pastes into the page currently centred in the viewport. */
  pasteClipboard(offset = 0) {
    const data = getClipboard();
    if (!data) return;
    const targetId = this.lastReportedVisiblePage ?? this.pages[0]?.data.id;
    const page = this.pages.find((p) => p.data.id === targetId);
    if (!page) return;

    const newStrokes: Stroke[] = data.strokes.map((s) => ({
      ...s,
      id: uuidv4(),
      points: s.points.map((p) => ({ ...p, x: p.x + offset, y: p.y + offset })),
      bounds: {
        minX: s.bounds.minX + offset,
        minY: s.bounds.minY + offset,
        maxX: s.bounds.maxX + offset,
        maxY: s.bounds.maxY + offset,
      },
    }));
    const newTexts: TextObject[] = data.textObjects.map((t) => ({ ...t, id: uuidv4(), x: t.x + offset, y: t.y + offset }));
    const newImages: ImageObject[] = data.imageObjects.map((i) => ({ ...i, id: uuidv4(), x: i.x + offset, y: i.y + offset }));

    this.history.push({
      do: () => {
        for (const s of newStrokes) {
          page.data.strokes.push(s);
          if (page.mounted) this.renderStroke(page, s);
        }
        for (const t of newTexts) {
          page.data.textObjects.push(t);
          if (page.mounted) this.renderTextObject(page, t);
        }
        for (const i of newImages) page.data.imageObjects.push(i);
        this.onChange(page.data.id);
      },
      undo: () => {
        const ids = new Set([...newStrokes, ...newTexts, ...newImages].map((o) => o.id));
        page.data.strokes = page.data.strokes.filter((s) => !ids.has(s.id));
        page.data.textObjects = page.data.textObjects.filter((t) => !ids.has(t.id));
        page.data.imageObjects = page.data.imageObjects.filter((i) => !ids.has(i.id));
        for (const s of newStrokes) this.removeStrokeGraphic(page, s.id);
        for (const t of newTexts) this.removeTextView(page, t.id);
        for (const i of newImages) this.removeImageView(page, i.id);
        this.onChange(page.data.id);
      },
    });
    this.setSelection(page, [
      ...newStrokes.map((s) => ({ kind: "stroke" as const, id: s.id })),
      ...newTexts.map((t) => ({ kind: "text" as const, id: t.id })),
      ...newImages.map((i) => ({ kind: "image" as const, id: i.id })),
    ]);
  }

  // ---------- misc ----------

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const p = this.viewport.toScreen(x, y);
    const rect = this.container.getBoundingClientRect();
    return { x: p.x + rect.left, y: p.y + rect.top };
  }

  getViewportScale(): number {
    return this.viewport?.scale.x ?? 1;
  }

  /** Renders one sheet at a fixed scale for its thumbnail, then restores the live view. */
  async exportThumbnail(pageId: string, maxWidth = 320): Promise<Uint8Array> {
    const page = this.pages.find((p) => p.data.id === pageId);
    if (!page) throw new Error(`unknown page ${pageId}`);

    const wasMounted = page.mounted;
    if (!wasMounted) this.mountPage(page);

    const prev = {
      x: this.viewport.x,
      y: this.viewport.y,
      sx: this.viewport.scale.x,
      sy: this.viewport.scale.y,
    };
    const overlayVisible = this.overlayLayer.visible;
    const siblingVisibility = this.pages.map((p) => p.root.visible);
    this.overlayLayer.visible = false;
    for (const p of this.pages) p.root.visible = p === page;

    const scale = maxWidth / page.data.width;
    this.viewport.scale.set(scale);
    this.viewport.position.set(-page.offsetX * scale, -page.offsetY * scale);
    drawTemplate(page.bg, page.data.template, page.data.width, page.data.height, 1 / Math.max(scale, 0.0001));

    const canvas = this.app.renderer.extract.canvas(page.root) as HTMLCanvasElement;

    this.overlayLayer.visible = overlayVisible;
    this.pages.forEach((p, i) => (p.root.visible = siblingVisibility[i]));
    this.viewport.position.set(prev.x, prev.y);
    this.viewport.scale.set(prev.sx, prev.sy);
    this.drawPageBackground(page);
    if (!wasMounted) this.unmountPage(page);

    return await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("thumbnail encode failed"));
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      }, "image/png");
    });
  }

  destroy() {
    this.destroyed = true;
    this.viewTween?.cancel();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app.canvas?.removeEventListener("wheel", this.onWheel);
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }
}
