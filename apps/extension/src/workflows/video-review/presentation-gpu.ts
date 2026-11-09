import { parseColor } from '@sniptale/foundation/color';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewLayer,
  type GpuPreviewRenderer,
} from '../../features/video/composition/canvas/gpu-preview';
import { createPreviewRenderResources } from './preview-render-resources';

type Size = { width: number; height: number };
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

/** Owns one bounded GPU transaction; callers retain source leases until render settles. */
export function createPresentationGpu(
  createBackend: typeof createGpuPreviewRenderer = createGpuPreviewRenderer
) {
  const resources = createPreviewRenderResources({
    maximumCanvases: 2,
    maximumManagedBytes: 256 * 1024 * 1024,
  });
  let preparation: Promise<GpuPreviewRenderer | null> | null = null;
  let backend: GpuPreviewRenderer | null = null;
  let disabled = false;
  let disposed = false;
  let active = false;
  const retire = () => {
    if (active || (!disposed && !disabled)) return;
    backend?.dispose();
    backend = null;
    resources.dispose();
  };
  return {
    dispose() {
      disposed = true;
      retire();
    },
    /** False permits hardware fallback; all source/geometry failures remain errors. */
    async render(args: {
      output: Size;
      context: CanvasRenderingContext2D;
      signal: AbortSignal;
      prepare(primitives: {
        color(color: string, opacity: number): GpuPreviewLayer;
        raster(paint: (context: CanvasRenderingContext2D) => void): GpuPreviewLayer;
      }): { layers: readonly GpuPreviewLayer[]; release(): void };
    }): Promise<boolean> {
      args.signal.throwIfAborted();
      if (disposed) throw new Error('Presentation GPU is disposed');
      if (disabled) return false;
      if (active) throw new Error('Presentation GPU frame is already in flight');
      active = true;
      const leases: { release(): void }[] = [];
      let prepared: ReturnType<typeof args.prepare> | undefined;
      let bitmap: ImageBitmap | undefined;
      let white: ReturnType<typeof resources.canvas> | undefined;
      try {
        preparation ??= createBackend({
          reserve: (bytes) => resources.bytes('presentation-gpu', bytes),
        });
        backend = await preparation;
        args.signal.throwIfAborted();
        if (!backend) {
          disabled = true;
          return false;
        }
        const rect = { x: 0, y: 0, ...args.output };
        prepared = args.prepare({
          color(value, opacity) {
            const color = parseColor(value);
            if (!color) throw new Error('Presentation color is unavailable');
            if (!white) {
              white = resources.canvas('presentation-color', { width: 1, height: 1 });
              leases.push(white);
            }
            const fill = white;
            fill.context.fillStyle = '#ffffff';
            fill.context.fillRect(0, 0, 1, 1);
            return {
              source: fill.canvas,
              rect,
              inverse: identity,
              clampSourceEdges: ['left', 'top', 'right', 'bottom'],
              tint: [color.red / 255, color.green / 255, color.blue / 255, color.alpha],
              opacity,
            };
          },
          raster(paint) {
            const raster = resources.canvas('presentation-watermark', args.output);
            leases.push(raster);
            paint(raster.context);
            return { source: raster.canvas, rect, inverse: identity };
          },
        });
        bitmap = await backend.render({
          output: args.output,
          logical: args.output,
          layers: prepared.layers,
          signal: args.signal,
        });
        args.signal.throwIfAborted();
        args.context.save();
        try {
          args.context.setTransform(1, 0, 0, 1, 0, 0);
          args.context.globalAlpha = 1;
          args.context.globalCompositeOperation = 'copy';
          args.context.filter = 'none';
          args.context.shadowColor = 'transparent';
          args.context.shadowBlur = 0;
          args.context.shadowOffsetX = args.context.shadowOffsetY = 0;
          args.context.drawImage(bitmap, 0, 0);
        } finally {
          args.context.restore();
        }
        return true;
      } catch (error) {
        args.signal.throwIfAborted();
        if (!(error instanceof GpuPreviewDeviceError)) throw error;
        disabled = true;
        return false;
      } finally {
        bitmap?.close();
        prepared?.release();
        for (const lease of leases) lease.release();
        active = false;
        retire();
      }
    },
  };
}
