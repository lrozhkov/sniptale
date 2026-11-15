import type { GpuPreviewRenderer } from '../../../features/video/composition/canvas/gpu-preview';
import { GpuPreviewDeviceError } from '../../../features/video/composition/canvas/gpu-preview';
import type {
  GpuPreviewTarget,
  GpuPreviewTargetFactory,
} from '../../../features/video/composition/canvas/preview-presentation';

interface Destination {
  canvas: HTMLCanvasElement;
  surface: GpuPreviewTarget['surface'];
  leased: boolean;
}

/** Owns private immutable endpoint destinations, independently of GPU job admission. */
export function createMaterializerGpuOutputs(ownerDocument: Document) {
  const pools = new Map<GpuPreviewRenderer, Set<Destination>>();
  let disposed = false;
  const retire = (renderer: GpuPreviewRenderer, entry: Destination) => {
    const pool = pools.get(renderer);
    if (!pool?.delete(entry)) return;
    try {
      entry.surface.dispose();
    } finally {
      entry.canvas.width = entry.canvas.height = 0;
      if (!pool.size) pools.delete(renderer);
    }
  };
  const acquire: GpuPreviewTargetFactory = (size, renderer) => {
    if (disposed) throw new Error('Materialized GPU destinations are disposed.');
    if (
      !Number.isSafeInteger(size.width) ||
      !Number.isSafeInteger(size.height) ||
      size.width <= 0 ||
      size.height <= 0
    )
      throw new Error('Materialized GPU dimensions are unavailable.');
    if (!renderer.createSurface)
      throw new GpuPreviewDeviceError('Materialized GPU presentation is unavailable.');
    const pool = pools.get(renderer) ?? new Set<Destination>();
    let entry = [...pool].find(
      (value) =>
        !value.leased && value.canvas.width === size.width && value.canvas.height === size.height
    );
    if (!entry) {
      for (const idle of pool) if (!idle.leased) retire(renderer, idle);
      // An outer pair and its retained nested cut pair share the Native source provider.
      if (pool.size >= 4) throw new Error('Materialized GPU destination capacity is exhausted.');
      const canvas = ownerDocument.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const surface = renderer.createSurface(canvas, { offscreen: true });
      entry = { canvas, surface, leased: false };
      pool.add(entry);
      pools.set(renderer, pool);
    }
    entry.leased = true;
    const destination = entry;
    let released = false;
    return {
      canvas: destination.canvas,
      surface: destination.surface,
      release() {
        if (released) return;
        released = true;
        try {
          destination.surface.releaseImage?.();
        } finally {
          destination.leased = false;
          if (disposed) retire(renderer, destination);
        }
      },
    };
  };
  return {
    acquire,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [renderer, pool] of pools)
        for (const entry of pool) if (!entry.leased) retire(renderer, entry);
    },
  };
}
