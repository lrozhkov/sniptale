import { Canvas } from 'fabric';

type RenderRect = { x: number; y: number; width: number; height: number };
type DocumentSize = { width: number; height: number };
const MAX_INTERACTIVE_BACKING_PIXELS = 4_000_000;

/** The backing canvas covers the scrollable workspace; interactive frames paint only its visible part. */
export class EditorCanvas extends Canvas {
  private renderViewport: HTMLElement | null = null;
  private virtualStage: HTMLElement | null = null;
  private documentSize: DocumentSize | null = null;
  private documentMargin = 0;
  private presentationScale = 1;
  private showOutsideCanvas = true;

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

  setShowOutsideCanvas(show: boolean): void {
    if (this.showOutsideCanvas === show) return;
    this.showOutsideCanvas = show;
    this.requestRenderAll();
  }

  setDocumentGeometry(size: DocumentSize, margin: number): void {
    this.documentSize = size.width > 0 && size.height > 0 ? size : null;
    this.documentMargin = this.documentSize ? margin : 0;
    if (!this.documentSize) {
      const surface = this.wrapperEl.parentElement;
      if (surface) {
        surface.style.removeProperty('width');
        surface.style.removeProperty('height');
      }
      this.wrapperEl.style.removeProperty('left');
      this.wrapperEl.style.removeProperty('top');
      return;
    }
    this.refreshVirtualViewport();
  }

  setPresentationScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.presentationScale = scale;
    this.refreshVirtualViewport();
  }

  getDocumentClientRect(): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null {
    if (!this.documentSize) return null;
    const rect = this.wrapperEl.parentElement?.getBoundingClientRect();
    if (!rect) return null;
    return {
      left: rect.left + this.documentMargin * this.presentationScale,
      top: rect.top + this.documentMargin * this.presentationScale,
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
    const logicalWidth = this.documentSize.width + this.documentMargin * 2;
    const logicalHeight = this.documentSize.height + this.documentMargin * 2;
    surface.style.width = `${logicalWidth * scale}px`;
    surface.style.height = `${logicalHeight * scale}px`;
    const width = Math.max(1, this.renderViewport.clientWidth);
    const height = Math.max(1, this.renderViewport.clientHeight);
    const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    this.enableRetinaScaling =
      width * height * devicePixelRatio ** 2 <= MAX_INTERACTIVE_BACKING_PIXELS;
    if (width !== this.width || height !== this.height) this.setDimensions({ width, height });
    this.wrapperEl.style.position = 'absolute';
    const surfaceRect = surface.getBoundingClientRect();
    const viewportRect = this.renderViewport.getBoundingClientRect();
    const left = Math.max(
      0,
      Math.min(logicalWidth * scale - width, viewportRect.left - surfaceRect.left)
    );
    const top = Math.max(
      0,
      Math.min(logicalHeight * scale - height, viewportRect.top - surfaceRect.top)
    );
    this.wrapperEl.style.left = `${left}px`;
    this.wrapperEl.style.top = `${top}px`;
    this.setViewportTransform([
      scale,
      0,
      0,
      scale,
      this.documentMargin * scale - left,
      this.documentMargin * scale - top,
    ]);
    this.calcOffset();
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
