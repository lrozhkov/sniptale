import type {
  GpuPreviewRenderer,
  GpuPreviewPresentationSurface,
} from '../../../../features/video/composition/canvas/gpu-preview';
import type {
  NativePreviewFramePresenter,
  NativePreviewGpuOutput,
  NativePreviewGpuTargetFactory,
} from '../scene/types';

interface PresentationOptions {
  fallback: () => HTMLCanvasElement | null;
  host: () => HTMLDivElement | null;
}
interface Destination {
  canvas: HTMLCanvasElement;
  surface: GpuPreviewPresentationSurface;
  renderer: GpuPreviewRenderer;
  width: number;
  height: number;
  leased: boolean;
  retired: boolean;
}

/** Owns frontend destinations and accepted publication, never the GPU device or project model. */
class NativePreviewPresentationSession implements NativePreviewFramePresenter {
  private readonly destinations = new Set<Destination>();
  private mounted = false;
  private disposed = false;
  private host: HTMLDivElement | null = null;
  private fallback: HTMLCanvasElement | null = null;
  private originalFallback: { opacity: string; pointerEvents: string; active: boolean } | null =
    null;
  private front: NativePreviewGpuOutput | null = null;

  constructor(private options: PresentationOptions) {}

  mount(): void {
    if (this.disposed) throw new Error('Preview presentation is disposed.');
    if (this.mounted) return;
    const host = this.options.host(),
      fallback = this.options.fallback();
    if (!host || !fallback) throw new Error('Preview presentation host is unavailable.');
    this.host = host;
    this.fallback = fallback;
    this.originalFallback = {
      opacity: fallback.style.opacity,
      pointerEvents: fallback.style.pointerEvents,
      active: fallback.hasAttribute('data-preview-stage-canvas'),
    };
    this.mounted = true;
    this.show(null);
  }

  private currentHost(): HTMLDivElement {
    if (
      !this.mounted ||
      this.disposed ||
      !this.host ||
      this.options.host() !== this.host ||
      this.options.fallback() !== this.fallback
    )
      throw new Error('Preview presentation host is unavailable.');
    return this.host;
  }

  private clear(destination: Destination): void {
    if (!this.destinations.delete(destination)) return;
    try {
      destination.surface.dispose();
    } finally {
      destination.canvas.remove();
    }
  }

  private retire(destination: Destination): void {
    destination.retired = true;
    if (!destination.leased) this.clear(destination);
  }

  private show(output: NativePreviewGpuOutput | null): void {
    const fallback = this.fallback;
    if (fallback) {
      fallback.style.opacity = output ? '0' : '1';
      fallback.style.pointerEvents = output ? 'none' : (this.originalFallback?.pointerEvents ?? '');
      if (output) fallback.removeAttribute('data-preview-stage-canvas');
      else fallback.setAttribute('data-preview-stage-canvas', '');
    }
    for (const destination of this.destinations) {
      const visible = output?.canvas === destination.canvas;
      destination.canvas.style.opacity = visible ? '1' : '0';
      destination.canvas.style.pointerEvents = visible ? 'auto' : 'none';
      if (visible) destination.canvas.setAttribute('data-preview-stage-canvas', '');
      else destination.canvas.removeAttribute('data-preview-stage-canvas');
    }
  }

  acquire: NativePreviewGpuTargetFactory = (size, renderer) => {
    const host = this.currentHost();
    if (
      !renderer.createSurface ||
      !Number.isSafeInteger(size.width) ||
      !Number.isSafeInteger(size.height) ||
      size.width < 1 ||
      size.height < 1 ||
      size.width > 0xffffffff ||
      size.height > 0xffffffff
    )
      throw new Error('Preview presentation destination is unavailable.');
    for (const destination of this.destinations)
      if (
        !destination.leased &&
        (destination.renderer !== renderer ||
          destination.width !== size.width ||
          destination.height !== size.height)
      )
        this.retire(destination);
    let destination = [...this.destinations].find(
      (candidate) =>
        !candidate.leased &&
        !candidate.retired &&
        candidate.renderer === renderer &&
        candidate.width === size.width &&
        candidate.height === size.height
    );
    if (!destination) {
      if (this.destinations.size >= 2)
        throw new Error('Preview presentation destinations are busy.');
      const canvas = host.ownerDocument.createElement('canvas');
      let surface: GpuPreviewPresentationSurface | undefined;
      try {
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.className = 'absolute inset-0 h-full w-full';
        canvas.style.backgroundColor = '#000';
        canvas.style.opacity = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.willChange = 'opacity';
        host.appendChild(canvas);
        surface = renderer.createSurface(canvas, { offscreen: true });
        if (surface.canvas !== canvas)
          throw new Error('Preview presentation destination does not match.');
        destination = { canvas, surface, renderer, ...size, leased: false, retired: false };
        this.destinations.add(destination);
      } catch (error) {
        try {
          surface?.dispose();
        } finally {
          canvas.remove();
        }
        throw error;
      }
    }
    const leased = destination;
    if (leased.canvas.parentElement !== host)
      throw new Error('Preview presentation destination was detached.');
    leased.leased = true;
    let released = false;
    return {
      canvas: leased.canvas,
      surface: leased.surface,
      release: () => {
        if (released) return;
        released = true;
        leased.leased = false;
        if (leased.retired || this.disposed) this.clear(leased);
      },
    };
  };

  publish = (output: NativePreviewGpuOutput | null, acceptGeometry: () => void): void => {
    const host = this.currentHost();
    if (
      output &&
      ![...this.destinations].some(
        (destination) =>
          destination.canvas === output.canvas &&
          destination.leased &&
          !destination.retired &&
          destination.canvas.parentElement === host
      )
    )
      throw new Error('Preview presentation output is not owned.');
    const previous = this.front;
    this.show(output);
    try {
      acceptGeometry();
      if (this.disposed) throw new Error('Preview presentation is disposed.');
    } catch (error) {
      if (!this.disposed) this.show(previous);
      throw error;
    }
    this.front = output;
    if (previous && previous !== output) previous.release();
    const canvas = output?.canvas ?? this.fallback;
    canvas?.dispatchEvent(new Event('sniptale-preview-frame', { bubbles: true }));
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    for (const destination of this.destinations) {
      destination.canvas.style.opacity = '0';
      destination.canvas.style.pointerEvents = 'none';
      destination.canvas.removeAttribute('data-preview-stage-canvas');
      destination.retired = true;
    }
    const previous = this.front;
    this.front = null;
    previous?.release();
    for (const destination of this.destinations) this.retire(destination);
    if (this.fallback && this.originalFallback) {
      this.fallback.style.opacity = this.originalFallback.opacity;
      this.fallback.style.pointerEvents = this.originalFallback.pointerEvents;
      if (this.originalFallback.active) this.fallback.setAttribute('data-preview-stage-canvas', '');
      else this.fallback.removeAttribute('data-preview-stage-canvas');
    }
  };
}

/** Construction is inert; the mounted stage explicitly begins and ends this owner lifetime. */
export function createNativePreviewPresentationSession(options: PresentationOptions) {
  return new NativePreviewPresentationSession(options);
}
