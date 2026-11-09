import type { EffectRuntimeGpuPlanResult } from '../../contracts/effect-runtime/types';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from '../../features/video/composition/canvas/gpu-preview';
import { materializeEffectRuntimeGpuPlan } from '../../features/video/composition/effect-runtime/render/gpu-plan';

type Factory = () => Promise<GpuPreviewRenderer | null>;

/** Own only completed pass/chunk bitmaps. The request owner retains every borrowed wire resource. */
export function createEffectRuntimeGpuPlanRenderer(options: { rendererFactory?: Factory } = {}) {
  let pending: Promise<GpuPreviewRenderer | null> | undefined;
  let renderer: GpuPreviewRenderer | null = null;
  let disposed = false;
  let busy = false;
  let deviceFailed = false;
  const lifetime = new AbortController();
  const acquire = () =>
    (pending ??= (options.rendererFactory ?? createGpuPreviewRenderer)().then((value) => {
      if (disposed) {
        value?.dispose();
        throw new Error('Effect GPU renderer is disposed.');
      }
      renderer = value;
      return value;
    }));
  return {
    async isAvailable(): Promise<boolean> {
      if (disposed || deviceFailed) return false;
      try {
        return (await acquire()) !== null;
      } catch (error) {
        if (error instanceof GpuPreviewDeviceError) {
          deviceFailed = true;
          return false;
        }
        throw error;
      }
    },
    async render(plan: EffectRuntimeGpuPlanResult, signal: AbortSignal): Promise<ImageBitmap> {
      if (disposed) throw new Error('Effect GPU renderer is disposed.');
      if (busy) throw new Error('Effect GPU renderer already has a frame in flight.');
      busy = true;
      const combined = AbortSignal.any([signal, lifetime.signal]);
      try {
        combined.throwIfAborted();
        const gpu = await acquire();
        combined.throwIfAborted();
        if (!gpu || deviceFailed)
          throw new GpuPreviewDeviceError('Effect GPU device is unavailable.');
        return await materializeEffectRuntimeGpuPlan(plan, gpu, combined);
      } catch (error) {
        if (error instanceof GpuPreviewDeviceError) deviceFailed = true;
        throw error;
      } finally {
        busy = false;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      renderer?.dispose();
    },
  };
}
