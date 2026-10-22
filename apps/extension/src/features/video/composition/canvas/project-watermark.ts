import type { VideoProject, VideoProjectAsset } from '../../project/types/model';
import { getVideoProjectWatermarkAsset } from '../../project/scene/watermark';
import { createWatermarkRenderer, type WatermarkRenderer } from './watermark';

type Output = { width: number; height: number };
type Prepared = Readonly<Pick<WatermarkRenderer, 'bounds' | 'draw'>>;
type Waiter = { resolve(value: Prepared): void; reject(error: unknown): void; remove(): void };
type Request = {
  key: string;
  settings: VideoProject['watermark'];
  asset: VideoProjectAsset | undefined;
  output: Output;
  controller: AbortController;
  waiters: Set<Waiter>;
};

/** One preview session or export job owns one cache and one active preparation. */
export function createVideoProjectWatermarkRenderer(
  readAsset: (asset: VideoProjectAsset) => Promise<Blob | null>
) {
  let completed: { key: string; renderer: WatermarkRenderer } | undefined;
  let active: Request | undefined;
  let desired: Request | undefined;
  const cancellation = () => new DOMException('Watermark preparation was cancelled.', 'AbortError');
  const settle = (request: Request, result: Prepared | undefined, failure?: unknown) => {
    for (const waiter of request.waiters) {
      waiter.remove();
      if (result) waiter.resolve(result);
      else waiter.reject(failure);
    }
    request.waiters.clear();
  };
  const cancel = (request: Request) => {
    request.controller.abort();
    settle(request, undefined, cancellation());
  };
  const start = () => {
    if (active || !desired) return;
    const request = desired;
    active = request;
    completed?.renderer.dispose();
    completed = undefined;
    const unavailable = () => new Error('Watermark image is unavailable.');
    void createWatermarkRenderer(
      request.settings,
      request.output,
      {
        read: (reference) => {
          if (!request.asset || request.settings?.image?.assetId !== reference)
            return Promise.reject(unavailable());
          return readAsset(request.asset);
        },
        unavailable,
      },
      request.controller.signal
    )
      .then(
        (renderer) => {
          if (active === request) active = undefined;
          if (desired !== request || request.controller.signal.aborted) {
            renderer.dispose();
            settle(request, undefined, cancellation());
            return;
          }
          completed = { key: request.key, renderer };
          desired = undefined;
          settle(request, renderer);
        },
        (failure: unknown) => {
          if (active === request) active = undefined;
          if (desired === request) desired = undefined;
          settle(request, undefined, failure);
        }
      )
      .finally(() => {
        if (active === request) active = undefined;
        start();
      });
  };
  return {
    async prepare(project: VideoProject, output: Output, signal?: AbortSignal): Promise<Prepared> {
      signal?.throwIfAborted();
      const settings = project.watermarkEnabled === false ? undefined : project.watermark;
      const asset = settings ? getVideoProjectWatermarkAsset(project) : undefined;
      const key = JSON.stringify([
        project.id,
        settings,
        output.width,
        output.height,
        asset?.id,
        asset?.source,
        asset?.metadata.width,
        asset?.metadata.height,
        asset?.metadata.mimeType,
        asset?.metadata.size,
      ]);
      if (completed?.key === key) return Promise.resolve(completed.renderer);
      if (!desired || desired.key !== key) {
        if (desired) cancel(desired);
        if (active && active !== desired) cancel(active);
        desired = {
          key,
          settings: settings ? structuredClone(settings) : undefined,
          asset: asset ? structuredClone(asset) : undefined,
          output: { ...output },
          controller: new AbortController(),
          waiters: new Set(),
        };
      }
      const request = desired;
      const promise = new Promise<Prepared>((resolve, reject) => {
        const abort = () => {
          request.waiters.delete(waiter);
          waiter.remove();
          reject(signal?.reason ?? cancellation());
        };
        const waiter: Waiter = {
          resolve,
          reject,
          remove: () => signal?.removeEventListener('abort', abort),
        };
        request.waiters.add(waiter);
        signal?.addEventListener('abort', abort, { once: true });
      });
      start();
      return promise;
    },
    clear() {
      completed?.renderer.dispose();
      completed = undefined;
      if (desired) cancel(desired);
      if (active && active !== desired) cancel(active);
      desired = undefined;
    },
  };
}

/** Concrete disposable render dependency; durable settings and resource membership stay in the project. */
export type VideoProjectWatermarkRenderer = ReturnType<typeof createVideoProjectWatermarkRenderer>;
