import { getCurrentLocale } from '../platform/i18n';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogDocumentEntry,
} from '../features/video/project/effect-bundle/catalog';
import { renderEffectCatalogPreview } from '../workflows/video/effect-catalog-preview';
import { createEffectPosterStore } from '../composition/persistence/video-preview-cache/effect-posters';
import type { EffectRuntimeSandboxExecutor } from '../contracts/effect-runtime/types';
export type PreviewQueue = {
  enqueue(task: (executor: () => EffectRuntimeSandboxExecutor) => Promise<void>): void;
};
export function createEffectPreviewSession({
  target,
  queue,
  key,
  readDocument,
}: {
  target: HTMLCanvasElement;
  queue: PreviewQueue;
  key: string;
  readDocument(): { catalog: EffectBundleCatalogEntry; entry: EffectBundleCatalogDocumentEntry };
}) {
  let active = true;
  let revision = 0;
  let pending = false;
  let desired = 0.5;
  let poster = true;
  let cover: Blob | null = null;
  const store = createEffectPosterStore();
  const restoreCover = async (): Promise<ImageBitmap | null> => {
    cover ??= await store.load(key).catch(() => null);
    if (!cover) return null;
    try {
      return await createImageBitmap(cover);
    } catch {
      cover = null;
      return null;
    }
  };
  const render = (progress: number, isPoster = false) => {
    desired = progress;
    poster = isPoster;
    revision++;
    if (pending) return;
    pending = true;
    void (async () => {
      if (!active) return;
      const captured = revision;
      const coverRequest = poster;
      const frameProgress = desired;
      let bitmap: ImageBitmap | null = null;
      try {
        if (coverRequest) bitmap = await restoreCover();
        if (!active) return;
        if (!bitmap) {
          const token = coverRequest ? await store.begin().catch(() => null) : null;
          if (!active) return;
          bitmap = await new Promise<ImageBitmap | null>((resolve, reject) => {
            queue.enqueue(async (getExecutor) => {
              if (!active) {
                resolve(null);
                return;
              }
              try {
                const { catalog, entry } = readDocument();
                resolve(
                  await renderEffectCatalogPreview(
                    getExecutor(),
                    catalog,
                    entry,
                    frameProgress,
                    captured,
                    getCurrentLocale()
                  )
                );
              } catch (error) {
                reject(error);
              }
            });
          });
          if (!bitmap) return;
          if (active && coverRequest && token) {
            try {
              const posterCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              posterCanvas.getContext('2d')?.drawImage(bitmap, 0, 0);
              cover = await posterCanvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
              await store.commit(token, key, cover);
            } catch {
              /* Advisory cover cache must never block a usable preview. */
            }
          }
        }
        if (active && captured === revision && coverRequest === poster) {
          if (target.width !== bitmap.width) target.width = bitmap.width;
          if (target.height !== bitmap.height) target.height = bitmap.height;
          const context = target.getContext('2d');
          context?.clearRect(0, 0, target.width, target.height);
          context?.drawImage(bitmap, 0, 0);
          target.dataset['previewState'] = 'ready';
          target.style.display = '';
        }
      } catch {
        if (active && captured === revision && target.dataset['previewState'] !== 'ready') {
          target.dataset['previewState'] = 'failed';
          target.style.display = 'none';
        }
      } finally {
        bitmap?.close();
        pending = false;
        if (active && captured !== revision) render(desired, poster);
      }
    })();
  };
  return {
    render,
    renderAutoplay(progress: number) {
      // Hover ticks are optional. They must not obsolete the frame that can make
      // a cold preview visible. Explicit scrubs still use render's supersession.
      if (active && !pending) render(progress);
    },
    dispose() {
      active = false;
    },
  };
}
