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
  readSource,
}: {
  target: HTMLCanvasElement;
  queue: PreviewQueue;
  key: string;
  readDocument(): { catalog: EffectBundleCatalogEntry; entry: EffectBundleCatalogDocumentEntry };
  readSource(): HTMLCanvasElement | null;
}) {
  let active = true;
  let revision = 0;
  let pending = false;
  let desired = 0.5;
  let poster = true;
  let cover: Blob | null = null;
  const store = createEffectPosterStore();
  const render = (progress: number, isPoster = false) => {
    desired = progress;
    poster = isPoster;
    revision++;
    if (pending) return;
    pending = true;
    queue.enqueue(async (getExecutor) => {
      if (!active) return;
      const captured = revision;
      const coverRequest = poster;
      const frameProgress = desired;
      const inputSource = coverRequest ? null : readSource();
      let bitmap: ImageBitmap | null = null;
      try {
        if (coverRequest) {
          cover ??= await store.load(key).catch(() => null);
          if (cover) {
            try {
              bitmap = await createImageBitmap(cover);
            } catch {
              cover = null;
            }
          }
        }
        if (!active) return;
        if (!bitmap) {
          const token = coverRequest ? await store.begin().catch(() => null) : null;
          if (!active) return;
          bitmap = await renderEffectCatalogPreview(
            getExecutor(),
            readDocument().catalog,
            readDocument().entry,
            frameProgress,
            captured,
            inputSource
          );
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
        if (active && coverRequest === poster && (coverRequest || inputSource === readSource())) {
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
    });
  };
  return {
    render,
    dispose() {
      active = false;
    },
  };
}
