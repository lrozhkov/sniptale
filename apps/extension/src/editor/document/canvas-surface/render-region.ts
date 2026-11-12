import {
  ActiveSelection,
  Canvas,
  Group,
  Line,
  Path,
  Polyline,
  Textbox,
  util,
  type FabricObject,
  type TPointerEvent,
  type Transform,
} from 'fabric';
import {
  CUSTOM_JSON_PROPS,
  isBackgroundObject,
  isEditableObject,
  isUserObject,
} from '../model/index';
import {
  createEditorWorkspaceInsets,
  getEditorWorkspaceSurfaceSize,
  rebaseEditorWorkspaceInsets,
  type EditorWorkspaceInsets,
} from './workspace-extent';

type RenderRect = { x: number; y: number; width: number; height: number };
type DocumentSize = { width: number; height: number };
/** Visible bounds of a projected layer in Fabric scene coordinates. */
export type EditorLayerPresentationBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type PresentationBoundsResolver = (
  object: FabricObject
) => EditorLayerPresentationBounds | null | undefined;
const MAX_INTERACTIVE_BACKING_PIXELS = 4_000_000;
const MAX_WORKSPACE_SIDE = 200_000;
const WORKSPACE_EDGE_TRIGGER_PX = 160;
const WORKSPACE_GROWTH_PX = 768;
const RENDER_OVERSCAN_PX = 2;

/** The backing canvas covers the scrollable workspace; interactive frames paint only its visible part. */
export class EditorCanvas extends Canvas {
  private marqueeSelection: { objects: FabricObject[]; scope: Group | null } | null = null;
  private marqueeCancelled = false;
  private transformDraft: { transform: Transform; restore: () => void } | null = null;

  constructor(...args: ConstructorParameters<typeof Canvas>) {
    super(...args);
    this.on('mouse:down:before', ({ e, target }) => {
      this.marqueeCancelled = false;
      this.marqueeSelection =
        this.selection &&
        !this.skipTargetFind &&
        !this.isDrawingMode &&
        (!('button' in e) || e.button === 0) &&
        (!target || !target.selectable)
          ? { objects: this.getActiveObjects().slice(), scope: this.getSelectionGroupScope() }
          : null;
    });
    this.on('mouse:up', () => {
      this.marqueeSelection = null;
      this.transformDraft = null;
    });
    this.on('before:transform', ({ transform }) => this.captureTransformDraft(transform));
  }

  private captureTransformDraft(transform: Transform): void {
    const objects = new Set<FabricObject>();
    const restore: Array<() => void> = [];
    const capture = (object: FabricObject) => {
      if (objects.has(object)) return;
      objects.add(object);
      const geometry = {
        ...util.saveObjectTransform(object),
        originX: object.originX,
        originY: object.originY,
        width: object.width,
        height: object.height,
        strokeWidth: object.strokeWidth,
      };
      const custom = CUSTOM_JSON_PROPS.map((key) => {
        const value: unknown = object.get(key);
        return { key, value: structuredClone(value) };
      });
      const richShape = structuredClone(object.sniptaleRichShape);
      const path =
        object instanceof Path
          ? { path: structuredClone(object.path), pathOffset: object.pathOffset.clone() }
          : null;
      const points = object instanceof Polyline ? structuredClone(object.points) : null;
      const line =
        object instanceof Line
          ? { x1: object.x1, y1: object.y1, x2: object.x2, y2: object.y2 }
          : null;
      const restoreCustom = () => {
        for (const { key, value } of custom) {
          if (value === undefined) Reflect.deleteProperty(object, key);
          else object.set(key, value);
        }
      };
      restore.push(() => {
        restoreCustom();
        if (richShape === undefined) delete object.sniptaleRichShape;
        else object.sniptaleRichShape = richShape;
        object.set(geometry);
        if (object instanceof Path && path) object.set(path);
        if (object instanceof Polyline && points) object.set({ points });
        if (object instanceof Line && line) object.set(line);
        if (object instanceof Textbox) {
          // The text adapter detects a width change before it reads the accepted wrapping mode.
          object.initDimensions();
          restoreCustom();
          object.initDimensions();
          object.set({ width: geometry.width, height: geometry.height });
          restoreCustom();
        }
        object.dirty = true;
      });
      if (object instanceof Group) object.getObjects().forEach(capture);
    };
    const selected =
      transform.target instanceof ActiveSelection
        ? transform.target.getObjects()
        : [transform.target];
    for (const member of selected) {
      let root: FabricObject = member;
      while (root.parent) root = root.parent;
      capture(root);
    }
    capture(transform.target);
    this.transformDraft = {
      transform,
      restore: () => {
        restore.forEach((apply) => apply());
        objects.forEach((object) => object.setCoords());
      },
    };
  }

  /** Restores an interrupted native transform without publishing a document modification. */
  cancelCurrentTransform(): boolean {
    const transform = this._currentTransform;
    if (!transform) return false;
    if (this.transformDraft?.transform === transform) this.transformDraft.restore();
    else {
      const { left, top, scaleX, scaleY, skewX, skewY, angle, flipX, flipY } = transform.original;
      transform.target.set({
        left,
        top,
        scaleX,
        scaleY,
        skewX,
        skewY,
        angle,
        flipX,
        flipY,
        width: transform.width,
        height: transform.height,
      });
      transform.target.setCoords();
    }
    transform.actionPerformed = false;
    transform.target.isMoving = false;
    transform.target._scaling = false;
    this._currentTransform = null;
    this.transformDraft = null;
    delete this._objectsToRender;
    this.setCursor(this.defaultCursor);
    this.requestRenderAll();
    return true;
  }

  /** Restores the accepted selection before leaving a group or cancelling another operation. */
  cancelSelectionMarquee(): boolean {
    if (!this._groupSelector) return false;
    const previous = this.marqueeSelection;
    this._groupSelector = null;
    this.marqueeSelection = null;
    this.marqueeCancelled = true;
    this.clearContext(this.contextTop);
    this.discardActiveObject();
    if (previous) {
      this.selectionGroupScope = previous.scope;
      const siblings = this.getSelectionScopeObjects();
      const objects = previous.objects.filter((object) => siblings.includes(object));
      if (objects.length === 1) this.setActiveObject(objects[0]!);
      else if (objects.length > 1)
        this.setActiveObject(new ActiveSelection(objects, { canvas: this }));
    }
    this.requestRenderAll();
    return true;
  }

  /** Prevents modifier completion from reapplying an already cancelled marquee. */
  isSelectionMarqueeCancelled(): boolean {
    return this.marqueeCancelled;
  }

  override dispose(): ReturnType<Canvas['dispose']> {
    this.marqueeSelection = null;
    this.transformDraft = null;
    this.selectionGroupScope = null;
    return super.dispose();
  }

  private renderViewport: HTMLElement | null = null;
  private virtualStage: HTMLElement | null = null;
  private documentSize: DocumentSize | null = null;
  private workspaceInsets = createEditorWorkspaceInsets(0);
  private pendingCropWorkspace: {
    size: DocumentSize;
    insets: EditorWorkspaceInsets;
    scrollX: number;
    scrollY: number;
  } | null = null;
  private expandingCanvasWorkspace = false;
  private presentationScale = 1;
  private showOutsideCanvas = false;
  private layerSelectionPriority: FabricObject | null = null;
  private tracksLayerSelectionPriority = false;

  private selectionGroupScope: Group | null = null;
  private tracksSelectionGroupScope = false;

  /** Returns the entered group while it belongs to the live, editable document. */
  getSelectionGroupScope(): Group | null {
    const scope = this.selectionGroupScope;
    if (!scope) return null;
    let current: FabricObject = scope;
    while (true) {
      if (!current.visible || current.sniptaleLocked) {
        this.selectionGroupScope = null;
        return null;
      }
      const parent = current.parent;
      if (!parent) break;
      if (!parent.getObjects().includes(current)) {
        this.selectionGroupScope = null;
        return null;
      }
      current = parent;
    }
    if (!this.getObjects().includes(current)) this.selectionGroupScope = null;
    // Native groups refresh child hit coordinates only when subTargetCheck is persisted.
    this.selectionGroupScope?.getObjects().forEach((object) => object.setCoords());
    return this.selectionGroupScope;
  }

  /** Enters one sibling collection without changing serialized group interaction flags. */
  enterSelectionGroup(group: Group, event?: TPointerEvent): boolean {
    if (group.sniptaleType !== 'group') return false;
    const previous = this.selectionGroupScope;
    this.selectionGroupScope = group;
    if (!this.getSelectionGroupScope()) {
      this.selectionGroupScope = previous;
      return false;
    }
    if (!this.tracksSelectionGroupScope) {
      const followSelection = () => {
        const members = this.getActiveObjects();
        const parent = members[0]?.parent ?? null;
        if (members.length && members.every((object) => (object.parent ?? null) === parent)) {
          this.selectionGroupScope = parent;
        }
      };
      this.on('selection:created', followSelection);
      this.on('selection:updated', followSelection);
      this.tracksSelectionGroupScope = true;
    }
    this.discardActiveObject();
    if (event) {
      const hit = this.searchPossibleTargets(group.getObjects(), this.getScenePoint(event)).target;
      if (hit && hit.visible && hit.selectable && !hit.sniptaleLocked)
        this.setActiveObject(hit, event);
    }
    this.requestRenderAll();
    return true;
  }

  /** Selects the containing group and leaves exactly one entered level. */
  exitSelectionGroup(): boolean {
    const group = this.getSelectionGroupScope();
    if (!group) return false;
    this.discardActiveObject();
    this.selectionGroupScope = group.parent ?? null;
    this.setActiveObject(group);
    this.requestRenderAll();
    return true;
  }

  /** Lists the siblings available to pointer and marquee selection. */
  getSelectionScopeObjects(): FabricObject[] {
    return this.getSelectionGroupScope()?.getObjects() ?? this.getObjects();
  }

  setLayerSelectionPriority(object: FabricObject | null): void {
    if (!this.tracksLayerSelectionPriority) {
      const clearPriority = () => {
        this.layerSelectionPriority = null;
      };
      this.on('selection:created', clearPriority);
      this.on('selection:updated', clearPriority);
      this.on('selection:cleared', clearPriority);
      this.tracksLayerSelectionPriority = true;
    }
    this.layerSelectionPriority = object;
  }

  override findTarget(e: TPointerEvent): ReturnType<Canvas['findTarget']> {
    const priority = this.layerSelectionPriority;
    if (priority && this.getActiveObject() !== priority) this.layerSelectionPriority = null;
    const preserveObjectStacking = this.preserveObjectStacking;
    if (this.layerSelectionPriority) this.preserveObjectStacking = false;
    let native: ReturnType<Canvas['findTarget']>;
    try {
      native = super.findTarget(e);
    } finally {
      this.preserveObjectStacking = preserveObjectStacking;
    }
    const scope = this.getSelectionGroupScope();
    if (!scope || this.skipTargetFind || this._currentTransform || this._targetInfo) return native;
    const active = this.getActiveObject();
    if (active?.findControl(this.getViewportPoint(e), util.isTouchEvent(e))) return native;
    if (
      native.target === active &&
      (active instanceof ActiveSelection || this.layerSelectionPriority === active)
    )
      return native;
    const scoped = this.searchPossibleTargets(scope.getObjects(), this.getScenePoint(e));
    const target = scoped.target;
    if (!target || target.sniptaleLocked || !target.selectable) {
      // Empty space inside the entered group belongs to its marquee, not to its parent.
      if (this._checkTarget(scope, this.getScenePoint(e))) {
        return { subTargets: [], currentSubTargets: [] };
      }
      return native;
    }
    return {
      ...scoped,
      currentTarget: target,
      ...(scoped.container ? { currentContainer: scoped.container } : {}),
      currentSubTargets: scoped.subTargets,
    };
  }

  private presentationBounds: PresentationBoundsResolver | null = null;

  /** Undefined retains native bounds; null excludes a projected layer until its surface exists. */
  setLayerPresentationBoundsResolver(resolve: PresentationBoundsResolver | null): void {
    this.presentationBounds = resolve;
  }

  /** Returns presentation bounds for a projected layer, without changing document geometry. */
  getLayerPresentationBounds(
    object: FabricObject
  ): EditorLayerPresentationBounds | null | undefined {
    return this.presentationBounds?.(object);
  }

  override collectObjects(
    ...args: Parameters<Canvas['collectObjects']>
  ): ReturnType<Canvas['collectObjects']> {
    const native =
      this.getSelectionGroupScope()?.collectObjects(...args) ?? super.collectObjects(...args);
    if (!this.presentationBounds) return native;
    const [rect, options] = args;
    const includeIntersecting = options?.includeIntersecting ?? true;
    const nativeObjects = new Set(native);
    return this.getSelectionScopeObjects()
      .toReversed()
      .filter((object) => {
        const bounds = this.presentationBounds?.(object);
        if (bounds === undefined) return nativeObjects.has(object);
        if (bounds === null || !object.visible || !object.selectable) return false;
        if (includeIntersecting)
          return (
            bounds.left <= rect.left + rect.width &&
            bounds.left + bounds.width >= rect.left &&
            bounds.top <= rect.top + rect.height &&
            bounds.top + bounds.height >= rect.top
          );
        return (
          bounds.left >= rect.left &&
          bounds.top >= rect.top &&
          bounds.left + bounds.width <= rect.left + rect.width &&
          bounds.top + bounds.height <= rect.top + rect.height
        );
      });
  }

  /** Reads the current cursor or fully-contained marquee candidates without changing selection. */
  getSelectionPreviewObjects(hoverTarget?: FabricObject): FabricObject[] {
    if (!this.selection || this.skipTargetFind || this.isDrawingMode || this._currentTransform)
      return [];
    const marquee = this._groupSelector;
    const eligible = (object: FabricObject) =>
      object.visible &&
      object.selectable &&
      object.sniptaleLocked !== true &&
      isEditableObject(object);
    if (marquee) {
      if (marquee.deltaX === 0 && marquee.deltaY === 0) return [];
      const candidates = new Set(
        this.collectObjects(
          {
            left: marquee.x + Math.min(0, marquee.deltaX),
            top: marquee.y + Math.min(0, marquee.deltaY),
            width: Math.abs(marquee.deltaX),
            height: Math.abs(marquee.deltaY),
          },
          { includeIntersecting: false }
        )
      );
      return this.getSelectionScopeObjects()
        .toReversed()
        .filter((object) => candidates.has(object) && eligible(object));
    }
    const liveHover = (object: FabricObject): boolean => {
      let current = object;
      while (current.parent) {
        if (
          !current.parent.visible ||
          current.parent.sniptaleLocked ||
          !current.parent.getObjects().includes(current)
        )
          return false;
        current = current.parent;
      }
      return this.getObjects().includes(current);
    };
    return hoverTarget &&
      eligible(hoverTarget) &&
      liveHover(hoverTarget) &&
      !this.getActiveObjects().includes(hoverTarget)
      ? [hoverTarget]
      : [];
  }

  setRenderViewport(viewport: HTMLElement | null, stage?: HTMLElement): void {
    this.renderViewport = viewport;
    this.virtualStage = stage ?? null;
    if (this.virtualStage) this.refreshVirtualViewport();
  }

  get hasVirtualViewport(): boolean {
    return this.virtualStage !== null;
  }

  getDocumentSize(): DocumentSize | null {
    return this.documentSize;
  }

  getWorkspaceInsets(): EditorWorkspaceInsets {
    return { ...this.workspaceInsets };
  }

  captureDocumentViewportPosition(): { x: number; y: number } | null {
    if (!this.renderViewport || !this.documentSize) return null;
    return {
      x: this.renderViewport.scrollLeft - this.workspaceInsets.left * this.presentationScale,
      y: this.renderViewport.scrollTop - this.workspaceInsets.top * this.presentationScale,
    };
  }

  restoreDocumentViewportPosition(position: { x: number; y: number }): void {
    if (!this.renderViewport || !this.documentSize) return;
    const scale = this.presentationScale;
    const surface = getEditorWorkspaceSurfaceSize(this.documentSize, this.workspaceInsets);
    const left = this.workspaceInsets.left * scale + position.x;
    const top = this.workspaceInsets.top * scale + position.y;
    this.growWorkspace({
      left: Math.max(0, Math.ceil(-left / scale)),
      top: Math.max(0, Math.ceil(-top / scale)),
      right: Math.max(
        0,
        Math.ceil((left + this.renderViewport.clientWidth - surface.width * scale) / scale)
      ),
      bottom: Math.max(
        0,
        Math.ceil((top + this.renderViewport.clientHeight - surface.height * scale) / scale)
      ),
    });
    this.renderViewport.scrollLeft =
      this.workspaceInsets.left * this.presentationScale + position.x;
    this.renderViewport.scrollTop = this.workspaceInsets.top * this.presentationScale + position.y;
    this.refreshVirtualViewport();
  }

  setExpandingCanvasWorkspace(enabled: boolean): void {
    this.expandingCanvasWorkspace = enabled;
  }

  prepareWorkspaceForCrop(crop: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): void {
    if (!this.documentSize) return;
    this.pendingCropWorkspace = {
      size: { width: crop.width, height: crop.height },
      ...rebaseEditorWorkspaceInsets(this.workspaceInsets, this.documentSize, crop, 512),
    };
  }

  extendWorkspaceAtScrollEdge(): boolean {
    const viewport = this.renderViewport;
    if (!this.expandingCanvasWorkspace || !viewport || !this.documentSize) return false;
    const surface = getEditorWorkspaceSurfaceSize(this.documentSize, this.workspaceInsets);
    const scale = this.presentationScale;
    const growth = Math.max(512, Math.ceil(WORKSPACE_GROWTH_PX / scale));
    return this.growWorkspace({
      left: viewport.scrollLeft <= WORKSPACE_EDGE_TRIGGER_PX ? growth : 0,
      top: viewport.scrollTop <= WORKSPACE_EDGE_TRIGGER_PX ? growth : 0,
      right:
        viewport.scrollLeft + viewport.clientWidth >=
        surface.width * scale - WORKSPACE_EDGE_TRIGGER_PX
          ? growth
          : 0,
      bottom:
        viewport.scrollTop + viewport.clientHeight >=
        surface.height * scale - WORKSPACE_EDGE_TRIGGER_PX
          ? growth
          : 0,
    });
  }

  extendWorkspaceToContain(bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): boolean {
    if (!this.expandingCanvasWorkspace || !this.documentSize) return false;
    const inset = Math.ceil(80 / this.presentationScale);
    const growth = Math.max(512, Math.ceil(WORKSPACE_GROWTH_PX / this.presentationScale));
    return this.growWorkspace(
      {
        left: Math.max(
          0,
          Math.min(MAX_WORKSPACE_SIDE, -bounds.left + inset - this.workspaceInsets.left)
        ),
        top: Math.max(
          0,
          Math.min(MAX_WORKSPACE_SIDE, -bounds.top + inset - this.workspaceInsets.top)
        ),
        right: Math.max(
          0,
          bounds.right + inset - this.documentSize.width - this.workspaceInsets.right
        ),
        bottom: Math.max(
          0,
          bounds.bottom + inset - this.documentSize.height - this.workspaceInsets.bottom
        ),
      },
      growth
    );
  }

  private growWorkspace(
    amounts: Record<keyof EditorWorkspaceInsets, number>,
    minimumGrowth = 0
  ): boolean {
    const next = { ...this.workspaceInsets };
    for (const side of ['left', 'top', 'right', 'bottom'] as const) {
      if (amounts[side] > 0) {
        next[side] = Math.min(
          MAX_WORKSPACE_SIDE,
          next[side] + Math.max(minimumGrowth, amounts[side])
        );
      }
    }
    if (
      next.left === this.workspaceInsets.left &&
      next.top === this.workspaceInsets.top &&
      next.right === this.workspaceInsets.right &&
      next.bottom === this.workspaceInsets.bottom
    ) {
      return false;
    }
    const scrollX = next.left - this.workspaceInsets.left;
    const scrollY = next.top - this.workspaceInsets.top;
    this.workspaceInsets = next;
    this.updateWorkspaceSurface();
    if (this.renderViewport) {
      this.renderViewport.scrollLeft += scrollX * this.presentationScale;
      this.renderViewport.scrollTop += scrollY * this.presentationScale;
    }
    this.refreshVirtualViewport();
    this.requestRenderAll();
    return true;
  }

  setShowOutsideCanvas(show: boolean): void {
    if (this.showOutsideCanvas === show) return;
    this.showOutsideCanvas = show;
    this.requestRenderAll();
  }

  setDocumentGeometry(size: DocumentSize, margin: number, preserveWorkspace = false): void {
    const sameSize =
      this.documentSize?.width === size.width && this.documentSize.height === size.height;
    this.documentSize = size.width > 0 && size.height > 0 ? size : null;
    if (!this.documentSize) {
      this.workspaceInsets = createEditorWorkspaceInsets(0);
      this.pendingCropWorkspace = null;
      const surface = this.wrapperEl.parentElement;
      if (surface) {
        surface.style.removeProperty('width');
        surface.style.removeProperty('height');
      }
      this.wrapperEl.style.removeProperty('left');
      this.wrapperEl.style.removeProperty('top');
      return;
    }
    const pending = this.pendingCropWorkspace;
    const rebase =
      pending?.size.width === size.width && pending.size.height === size.height ? pending : null;
    this.workspaceInsets =
      rebase?.insets ??
      (preserveWorkspace && sameSize ? this.workspaceInsets : createEditorWorkspaceInsets(margin));
    this.pendingCropWorkspace = null;
    this.updateWorkspaceSurface();
    if (rebase && this.renderViewport) {
      this.renderViewport.scrollLeft += rebase.scrollX * this.presentationScale;
      this.renderViewport.scrollTop += rebase.scrollY * this.presentationScale;
    }
    this.refreshVirtualViewport();
  }

  setPresentationScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.presentationScale = scale;
    this.refreshVirtualViewport();
  }

  centerDocumentInViewport(): void {
    if (!this.renderViewport || !this.documentSize || !this.virtualStage) return;
    this.renderViewport.scrollLeft = Math.max(
      0,
      (this.workspaceInsets.left + this.documentSize.width / 2) * this.presentationScale -
        this.renderViewport.clientWidth / 2
    );
    this.renderViewport.scrollTop = Math.max(
      0,
      (this.workspaceInsets.top + this.documentSize.height / 2) * this.presentationScale -
        this.renderViewport.clientHeight / 2
    );
    this.refreshVirtualViewport();
  }

  ensureWorkspaceContainsObjects(): void {
    if (!this.documentSize) return;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const object of this.getObjects()) {
      if (!isUserObject(object) || isBackgroundObject(object)) continue;
      const rect = object.getBoundingRect();
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.left + rect.width);
      bottom = Math.max(bottom, rect.top + rect.height);
    }
    if (![left, top, right, bottom].every(Number.isFinite)) return;
    const padding = Math.ceil(80 / this.presentationScale);
    this.growWorkspace({
      left: Math.max(0, -left + padding - this.workspaceInsets.left),
      top: Math.max(0, -top + padding - this.workspaceInsets.top),
      right: Math.max(0, right + padding - this.documentSize.width - this.workspaceInsets.right),
      bottom: Math.max(
        0,
        bottom + padding - this.documentSize.height - this.workspaceInsets.bottom
      ),
    });
  }

  getDocumentClientRect(): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null {
    if (!this.documentSize) return null;
    const rect = this.wrapperEl.parentElement?.getBoundingClientRect();
    if (!rect) return null;
    return {
      left: rect.left + this.workspaceInsets.left * this.presentationScale,
      top: rect.top + this.workspaceInsets.top * this.presentationScale,
      width: this.documentSize.width * this.presentationScale,
      height: this.documentSize.height * this.presentationScale,
    };
  }

  renderDocumentCanvas(multiplier = 1): HTMLCanvasElement {
    if (!this.documentSize) return this.toCanvasElement(multiplier);
    const scale = this.presentationScale;
    return this.toCanvasElement(multiplier / scale, {
      left: this.viewportTransform[4],
      top: this.viewportTransform[5],
      width: this.documentSize.width * scale,
      height: this.documentSize.height * scale,
    });
  }

  refreshVirtualViewport(): void {
    if (!this.virtualStage || !this.renderViewport || !this.documentSize) return;
    const surface = this.wrapperEl.parentElement;
    if (!surface) return;
    const scale = this.presentationScale;
    const { width: logicalWidth, height: logicalHeight } = this.updateWorkspaceSurface();
    const width =
      Math.max(1, this.renderViewport.clientWidth, this.renderViewport.offsetWidth) +
      RENDER_OVERSCAN_PX * 2;
    const height =
      Math.max(1, this.renderViewport.clientHeight, this.renderViewport.offsetHeight) +
      RENDER_OVERSCAN_PX * 2;
    const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    this.enableRetinaScaling =
      width * height * devicePixelRatio ** 2 <= MAX_INTERACTIVE_BACKING_PIXELS;
    if (width !== this.width || height !== this.height) this.setDimensions({ width, height });
    this.wrapperEl.style.position = 'absolute';
    const surfaceRect = surface.getBoundingClientRect();
    const viewportRect = this.renderViewport.getBoundingClientRect();
    const left = Math.max(
      0,
      Math.min(
        logicalWidth * scale - width,
        viewportRect.left - surfaceRect.left - RENDER_OVERSCAN_PX
      )
    );
    const top = Math.max(
      0,
      Math.min(
        logicalHeight * scale - height,
        viewportRect.top - surfaceRect.top - RENDER_OVERSCAN_PX
      )
    );
    this.wrapperEl.style.left = `${left}px`;
    this.wrapperEl.style.top = `${top}px`;
    this.setViewportTransform([
      scale,
      0,
      0,
      scale,
      this.workspaceInsets.left * scale - left,
      this.workspaceInsets.top * scale - top,
    ]);
    this.calcOffset();
  }

  private updateWorkspaceSurface(): DocumentSize {
    const size = getEditorWorkspaceSurfaceSize(
      this.documentSize ?? { width: 0, height: 0 },
      this.workspaceInsets
    );
    const surface = this.wrapperEl.parentElement;
    if (!surface || !this.documentSize) return size;
    surface.style.width = `${size.width * this.presentationScale}px`;
    surface.style.height = `${size.height * this.presentationScale}px`;
    surface.style.setProperty(
      '--editor-workspace-image-left',
      `${(this.workspaceInsets.left / size.width) * 100}%`
    );
    surface.style.setProperty(
      '--editor-workspace-image-top',
      `${(this.workspaceInsets.top / size.height) * 100}%`
    );
    surface.style.setProperty(
      '--editor-workspace-image-right',
      `${((this.workspaceInsets.left + this.documentSize.width) / size.width) * 100}%`
    );
    surface.style.setProperty(
      '--editor-workspace-image-bottom',
      `${((this.workspaceInsets.top + this.documentSize.height) / size.height) * 100}%`
    );
    surface.style.setProperty(
      '--editor-workspace-image-width',
      `${(this.documentSize.width / size.width) * 100}%`
    );
    surface.style.setProperty(
      '--editor-workspace-image-height',
      `${(this.documentSize.height / size.height) * 100}%`
    );
    surface.style.setProperty(
      '--editor-workspace-bottom-inset',
      `${(this.workspaceInsets.bottom / size.height) * 100}%`
    );
    return size;
  }

  private getVisibleRenderRect(): RenderRect | null {
    if (this.hasVirtualViewport) return null;
    if (!this.renderViewport || this.width <= 0 || this.height <= 0) return null;
    const canvasRect = this.lowerCanvasEl.getBoundingClientRect();
    const viewportRect = this.renderViewport.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    const xScale = this.width / canvasRect.width;
    const yScale = this.height / canvasRect.height;
    const x = Math.max(0, Math.floor((viewportRect.left - canvasRect.left) * xScale) - 2);
    const y = Math.max(0, Math.floor((viewportRect.top - canvasRect.top) * yScale) - 2);
    const right = Math.min(
      this.width,
      Math.ceil((viewportRect.right - canvasRect.left) * xScale) + 2
    );
    const bottom = Math.min(
      this.height,
      Math.ceil((viewportRect.bottom - canvasRect.top) * yScale) + 2
    );
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  }

  override clearContext(ctx: CanvasRenderingContext2D): void {
    const isInteractiveContext = ctx === this.getContext() || ctx === this.contextTop;
    const rect = isInteractiveContext ? this.getVisibleRenderRect() : null;
    if (rect) {
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
    } else {
      super.clearContext(ctx);
    }
  }

  override renderCanvas(
    ctx: CanvasRenderingContext2D,
    objects: Parameters<Canvas['renderCanvas']>[1]
  ): void {
    if (ctx === this.getContext() && !this.showOutsideCanvas && this.documentSize) {
      const [scaleX, , , scaleY, offsetX, offsetY] = this.viewportTransform;
      this.clearContext(ctx);
      ctx.save();
      try {
        ctx.beginPath();
        ctx.rect(
          offsetX,
          offsetY,
          this.documentSize.width * scaleX,
          this.documentSize.height * scaleY
        );
        ctx.clip();
        super.renderCanvas(ctx, objects);
      } finally {
        ctx.restore();
      }
      return;
    }
    const rect = ctx === this.getContext() ? this.getVisibleRenderRect() : null;
    if (!rect) {
      super.renderCanvas(ctx, objects);
      return;
    }
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      super.renderCanvas(ctx, objects);
    } finally {
      ctx.restore();
    }
  }
}
