import { Canvas } from 'fabric';

type RenderRect = { x: number; y: number; width: number; height: number };

/** The backing canvas covers the scrollable workspace; interactive frames paint only its visible part. */
export class EditorCanvas extends Canvas {
  private renderViewport: HTMLElement | null = null;

  setRenderViewport(viewport: HTMLElement | null): void {
    this.renderViewport = viewport;
  }

  private getVisibleRenderRect(): RenderRect | null {
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
