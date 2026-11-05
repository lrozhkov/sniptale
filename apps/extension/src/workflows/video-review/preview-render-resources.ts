import type {
  GpuPreviewRenderer,
  GpuPreviewPresentationSurface,
} from '../../features/video/composition/canvas/gpu-preview';
import type {
  RenderCanvasLease,
  RenderResources,
} from '../../features/video/composition/canvas/render-resources';

interface ResourceLimits {
  maximumManagedBytes: number;
  maximumCanvases: number;
  createCanvas?: () => HTMLCanvasElement;
}

/** Exclusive nonfront/inflight lease; release only after presentation work and frontend ownership end. */
export interface PreviewGpuCanvasLease {
  canvas: HTMLCanvasElement;
  surface: GpuPreviewPresentationSurface;
  release(): void;
}

/** Acquires a distinct canvas bound to the supplied backend until the lease is released. */
export type PreviewGpuCanvasFactory = (
  size: { width: number; height: number },
  renderer: GpuPreviewRenderer
) => PreviewGpuCanvasLease;

interface GpuSurface {
  kind: 'gpu';
  canvas: HTMLCanvasElement;
  surface: GpuPreviewPresentationSurface;
  renderer: GpuPreviewRenderer;
  width: number;
  height: number;
  bytes: number;
  active: boolean;
}

interface Surface {
  kind: '2d';
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  optionsKey: string;
  bytes: number;
  active: boolean;
}

/** Fixed failure without caller-supplied role content or a lower-quality fallback. */
export class PreviewRenderResourceError extends Error {
  constructor() {
    super('Preview render resource allocation failed');
    this.name = 'PreviewRenderResourceError';
  }
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function surfaceBytes(
  width: number,
  height: number,
  options?: CanvasRenderingContext2DSettings
): number {
  const colorType: unknown = Object.entries(options ?? {}).find(
    ([key]) => key === 'colorType'
  )?.[1];
  const bytes = width * height * (colorType === 'float16' ? 8 : 4);
  if (
    !positiveInteger(width) ||
    !positiveInteger(height) ||
    width > 0xffffffff ||
    height > 0xffffffff ||
    !positiveInteger(bytes)
  ) {
    throw new PreviewRenderResourceError();
  }
  return bytes;
}

function contextKey(options?: CanvasRenderingContext2DSettings): string {
  return JSON.stringify(
    Object.entries(options ?? {})
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function clearBacking(canvas: HTMLCanvasElement): void {
  // Try both dimensions: a failing platform setter must not hide the allocation error.
  for (const dimension of ['width', 'height'] as const) {
    try {
      canvas[dimension] = 0;
    } catch {
      // Dropping the owner reference remains possible when the browser refuses resizing.
    }
  }
}

class PreviewRenderResources implements RenderResources {
  private surfaces: (Surface | GpuSurface)[] = [];
  private reservations = new Set<number>();
  private nextReservation = 0;
  private managedBytes = 0;
  private peakManagedBytes = 0;
  private peakCanvasCount = 0;
  private disposed = false;

  constructor(private limits: ResourceLimits) {
    this.limits = { ...limits };
    if (!positiveInteger(limits.maximumManagedBytes) || !positiveInteger(limits.maximumCanvases)) {
      throw new PreviewRenderResourceError();
    }
  }

  /** Includes idle backings; this is a managed ledger, not physical GPU memory. */
  get counters() {
    return {
      managedBytes: this.managedBytes,
      peakManagedBytes: this.peakManagedBytes,
      canvasCount: this.surfaces.length,
      peakCanvasCount: this.peakCanvasCount,
    };
  }

  /** Apply an exact next-phase budget without disturbing live leases on refusal. */
  replaceLimits(next: Pick<ResourceLimits, 'maximumManagedBytes' | 'maximumCanvases'>): void {
    if (
      this.disposed ||
      !positiveInteger(next.maximumManagedBytes) ||
      !positiveInteger(next.maximumCanvases)
    ) {
      throw new PreviewRenderResourceError();
    }
    // GPU destination bytes belong to external reservations; retirement gives their actual credit.
    for (const surface of [...this.surfaces]) {
      if (
        this.managedBytes <= next.maximumManagedBytes &&
        this.surfaces.length <= next.maximumCanvases
      )
        break;
      if (surface.kind === 'gpu' && !surface.active) this.remove(surface);
    }
    const idle = this.surfaces.filter((surface) => !surface.active);
    const liveBytes = this.managedBytes - idle.reduce((total, surface) => total + surface.bytes, 0);
    const liveCanvases = this.surfaces.length - idle.length;
    if (liveBytes > next.maximumManagedBytes || liveCanvases > next.maximumCanvases) {
      throw new PreviewRenderResourceError();
    }
    for (const surface of idle) {
      if (
        this.managedBytes <= next.maximumManagedBytes &&
        this.surfaces.length <= next.maximumCanvases
      )
        break;
      this.remove(surface);
    }
    this.limits = {
      ...this.limits,
      maximumManagedBytes: next.maximumManagedBytes,
      maximumCanvases: next.maximumCanvases,
    };
  }

  private remove(surface: Surface | GpuSurface): void {
    this.surfaces = this.surfaces.filter((candidate) => candidate !== surface);
    this.managedBytes -= surface.bytes;
    if (surface.kind === 'gpu') {
      try {
        surface.surface.dispose();
      } finally {
        surface.canvas.remove();
      }
    } else clearBacking(surface.canvas);
  }

  private admit(bytes: number, canvases: number): void {
    if (
      this.disposed ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      bytes > this.limits.maximumManagedBytes
    ) {
      throw new PreviewRenderResourceError();
    }
    const fits = () =>
      bytes <= this.limits.maximumManagedBytes - this.managedBytes &&
      canvases <= this.limits.maximumCanvases - this.surfaces.length;
    for (const surface of [...this.surfaces]) {
      if (fits()) break;
      if (!surface.active) this.remove(surface);
    }
    if (!fits()) throw new PreviewRenderResourceError();
  }

  private retain(bytes: number): void {
    this.managedBytes += bytes;
    this.peakManagedBytes = Math.max(this.peakManagedBytes, this.managedBytes);
    this.peakCanvasCount = Math.max(this.peakCanvasCount, this.surfaces.length);
  }

  private lease(surface: Surface): RenderCanvasLease {
    surface.active = true;
    let released = false;
    return {
      canvas: surface.canvas,
      context: surface.context,
      release: () => {
        if (released) return;
        released = true;
        surface.active = false;
      },
    };
  }

  canvas(
    role: string,
    size: { width: number; height: number },
    options?: CanvasRenderingContext2DSettings
  ): RenderCanvasLease {
    void role;
    const bytes = surfaceBytes(size.width, size.height, options);
    if (this.disposed) throw new PreviewRenderResourceError();
    const optionsKey = contextKey(options);
    const reusable = this.surfaces.find(
      (surface): surface is Surface =>
        surface.kind === '2d' &&
        !surface.active &&
        surface.width === size.width &&
        surface.height === size.height &&
        surface.optionsKey === optionsKey
    );
    if (reusable) {
      try {
        if (typeof reusable.context.reset === 'function') reusable.context.reset();
        // Older contexts need a width assignment to clear clips and saved state.
        else reusable.canvas.width = size.width;
        return this.lease(reusable);
      } catch {
        this.remove(reusable);
        throw new PreviewRenderResourceError();
      }
    }
    this.admit(bytes, 1);
    return this.allocate(size, options, optionsKey, bytes);
  }

  private allocate(
    size: { width: number; height: number },
    options: CanvasRenderingContext2DSettings | undefined,
    optionsKey: string,
    bytes: number
  ): RenderCanvasLease {
    let canvas: HTMLCanvasElement | undefined;
    try {
      canvas = this.limits.createCanvas?.() ?? document.createElement('canvas');
      canvas.width = 0;
      canvas.height = size.height;
      canvas.width = size.width;
      const context = canvas.getContext('2d', options);
      if (!context || canvas.width !== size.width || canvas.height !== size.height) {
        throw new PreviewRenderResourceError();
      }
      const surface: Surface = {
        kind: '2d',
        canvas,
        context,
        ...size,
        optionsKey,
        bytes,
        active: true,
      };
      this.surfaces.push(surface);
      this.retain(bytes);
      return this.lease(surface);
    } catch {
      if (canvas) clearBacking(canvas);
      throw new PreviewRenderResourceError();
    }
  }

  presentationCanvas(
    size: { width: number; height: number },
    renderer: GpuPreviewRenderer
  ): PreviewGpuCanvasLease {
    surfaceBytes(size.width, size.height);
    if (this.disposed || !renderer.createSurface) throw new PreviewRenderResourceError();
    for (const surface of [...this.surfaces])
      if (surface.kind === 'gpu' && !surface.active && surface.renderer !== renderer)
        this.remove(surface);
    const reusable = this.surfaces.find(
      (surface): surface is GpuSurface =>
        surface.kind === 'gpu' &&
        !surface.active &&
        surface.renderer === renderer &&
        surface.width === size.width &&
        surface.height === size.height
    );
    if (reusable) return this.gpuLease(reusable);
    const backendSurfaces = () =>
      this.surfaces.filter((surface) => surface.kind === 'gpu' && surface.renderer === renderer);
    for (const surface of backendSurfaces()) {
      if (backendSurfaces().length < 3) break;
      if (!surface.active) this.remove(surface);
    }
    if (backendSurfaces().length >= 3) throw new PreviewRenderResourceError();
    this.admit(0, 1);
    const canvas = this.limits.createCanvas?.() ?? document.createElement('canvas');
    let presentation: GpuPreviewPresentationSurface | undefined;
    try {
      canvas.width = 0;
      canvas.height = size.height;
      canvas.width = size.width;
      if (canvas.width !== size.width || canvas.height !== size.height)
        throw new PreviewRenderResourceError();
      presentation = renderer.createSurface(canvas, { offscreen: true });
      const surface: GpuSurface = {
        kind: 'gpu',
        canvas,
        surface: presentation,
        renderer,
        ...size,
        bytes: 0,
        active: true,
      };
      this.surfaces.push(surface);
      this.retain(0);
      return this.gpuLease(surface);
    } catch (error) {
      try {
        presentation?.dispose();
      } finally {
        canvas.remove();
      }
      throw error;
    }
  }

  private gpuLease(surface: GpuSurface): PreviewGpuCanvasLease {
    surface.active = true;
    let released = false;
    return {
      canvas: surface.canvas,
      surface: surface.surface,
      release: () => {
        if (released) return;
        released = true;
        surface.active = false;
        if (this.disposed) this.remove(surface);
      },
    };
  }

  bytes(role: string, count: number): { release(): void } {
    void role;
    if (!positiveInteger(count)) throw new PreviewRenderResourceError();
    this.admit(count, 0);
    const id = this.nextReservation++;
    this.reservations.add(id);
    this.retain(count);
    return {
      release: () => {
        if (this.reservations.delete(id)) this.managedBytes -= count;
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const deferredGpu = this.surfaces.some((surface) => surface.kind === 'gpu' && surface.active);
    for (const surface of [...this.surfaces])
      if (surface.kind !== 'gpu' || !surface.active) this.remove(surface);
    if (!deferredGpu) {
      this.reservations.clear();
      this.managedBytes = 0;
    }
  }
}

/** One session ledger with limits derived by its renderer's concrete allocation graph. */
export function createPreviewRenderResources(limits: ResourceLimits) {
  return new PreviewRenderResources(limits);
}
