/** An exclusive raster lease; callers release it after their last draw/read. */
export interface RenderCanvasLease {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  release(): void;
}

/** Managed estimates exclude decoder, compositor, driver and opaque browser allocations. */
export interface RenderResources {
  canvas(
    role: string,
    size: { width: number; height: number },
    options?: CanvasRenderingContext2DSettings
  ): RenderCanvasLease;
  bytes(role: string, count: number): { release(): void };
}
