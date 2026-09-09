import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogDocumentEntry,
} from '../features/video/project/effect-bundle/catalog';
import { createEffectRuntimeSandboxExecutor } from '../workflows/video/effect-runtime-sandbox';
import { renderEffectCatalogPreview } from '../workflows/video/effect-catalog-preview';
import type { EffectRuntimeSandboxExecutor } from '../contracts/effect-runtime/types';

type PreviewQueue = {
  enqueue(task: (executor: EffectRuntimeSandboxExecutor) => Promise<void>): void;
};
const PreviewContext = createContext<PreviewQueue | null>(null);

/** One isolated, serialized renderer per catalog; it never receives the editable project. */
export function EffectCatalogPreviewProvider({ children }: { children: ReactNode }) {
  const owner = useRef<PreviewQueue | null>(null);
  useEffect(() => {
    let active = true;
    let executor: EffectRuntimeSandboxExecutor | undefined;
    let queue = Promise.resolve();
    let lastFrameAt = 0;
    owner.current = {
      enqueue(task) {
        queue = queue
          .then(async () => {
            if (!active) return;
            await new Promise((resolve) =>
              window.setTimeout(resolve, Math.max(0, 1000 / 15 - (performance.now() - lastFrameAt)))
            );
            if (!active) return;
            lastFrameAt = performance.now();
            executor ??= createEffectRuntimeSandboxExecutor();
            await task(executor);
          })
          .catch(() => undefined);
      },
    };
    return () => {
      active = false;
      owner.current = null;
      executor?.dispose();
    };
  }, []);
  const bridge = useRef<PreviewQueue>({
    enqueue(task) {
      owner.current?.enqueue(task);
    },
  });
  return <PreviewContext.Provider value={bridge.current}>{children}</PreviewContext.Provider>;
}

export function EffectCatalogPreview({
  catalog,
  document: entry,
}: {
  catalog: EffectBundleCatalogEntry;
  document: EffectBundleCatalogDocumentEntry;
}) {
  const queue = useContext(PreviewContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const request = useRef<(progress: number) => void>(() => undefined);
  useEffect(() => {
    const target = canvas.current;
    if (!target || !queue) return;
    let active = true;
    let revision = 0;
    let pending = false;
    let desired = 0.5;
    const render = (progress: number) => {
      desired = progress;
      revision++;
      if (pending) return;
      pending = true;
      queue.enqueue(async (executor) => {
        if (!active) return;
        const captured = revision;
        try {
          const bitmap = await renderEffectCatalogPreview(
            executor,
            catalog,
            entry,
            desired,
            captured
          );
          try {
            if (active) {
              target.width = bitmap.width;
              target.height = bitmap.height;
              target.getContext('2d')?.drawImage(bitmap, 0, 0);
              target.dataset['previewState'] = 'ready';
              target.style.display = '';
            }
          } finally {
            bitmap.close();
          }
        } catch {
          if (active) {
            target.dataset['previewState'] = 'failed';
            target.style.display = 'none';
          }
        } finally {
          pending = false;
          if (active && captured !== revision) render(desired);
        }
      });
    };
    request.current = render;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        render(0.5);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => {
      active = false;
      request.current = () => undefined;
      observer.disconnect();
    };
  }, [catalog, entry, queue]);
  return (
    <canvas
      ref={canvas}
      className={[
        'block aspect-video h-auto max-h-28 w-full rounded-md object-contain',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      aria-hidden="true"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        request.current(Math.max(0, Math.min(0.999, (event.clientX - bounds.left) / bounds.width)));
      }}
      onPointerLeave={() => request.current(0.5)}
    />
  );
}
