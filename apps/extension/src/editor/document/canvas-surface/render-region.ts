import { Canvas, type FabricObject, type TPointerEvent } from 'fabric';
import { isBackgroundObject, isUserObject } from '../model/index';
import {
  createEditorWorkspaceInsets,
  getEditorWorkspaceSurfaceSize,
  rebaseEditorWorkspaceInsets,
  type EditorWorkspaceInsets,
} from './workspace-extent';

type RenderRect = { x: number; y: number; width: number; height: number };
type DocumentSize = { width: number; height: number };
const MAX_INTERACTIVE_BACKING_PIXELS = 4_000_000;
const MAX_WORKSPACE_SIDE = 200_000;
const WORKSPACE_EDGE_TRIGGER_PX = 160;
const WORKSPACE_GROWTH_PX = 768;
const RENDER_OVERSCAN_PX = 2;

/** The backing canvas covers the scrollable workspace; interactive frames paint only its visible part. */
export class EditorCanvas extends Canvas {
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
    if (!priority) return super.findTarget(e);
    if (this.getActiveObject() !== priority) {
      this.layerSelectionPriority = null;
      return super.findTarget(e);
    }
    const preserveObjectStacking = this.preserveObjectStacking;
    this.preserveObjectStacking = false;
    try {
      return super.findTarget(e);
    } finally {
      this.preserveObjectStacking = preserveObjectStacking;
    }
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
