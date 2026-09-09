import { createContext, useContext, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogDocumentEntry,
} from '../features/video/project/effect-bundle/catalog';
import { createEffectRuntimeSandboxExecutor } from '../workflows/video/effect-runtime-sandbox';
import { effectPosterKey, effectPreviewProgress } from '../workflows/video/effect-catalog-preview';
import { createEffectPreviewSession, type PreviewQueue } from './effect-catalog-preview-session';
import type { EffectRuntimeSandboxExecutor } from '../contracts/effect-runtime/types';

const PreviewContext = createContext<PreviewQueue | null>(null);

/** One serialized renderer per catalog. Cached covers do not instantiate the sandbox. */
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
            await task(() => (executor ??= createEffectRuntimeSandboxExecutor()));
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
  captureFrame,
}: {
  catalog: EffectBundleCatalogEntry;
  document: EffectBundleCatalogDocumentEntry;
  captureFrame?: (() => HTMLCanvasElement | null) | undefined;
}) {
  const queue = useContext(PreviewContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const request = useRef<(progress: number, poster?: boolean) => void>(() => undefined);
  const source = useRef<HTMLCanvasElement | null>(null);
  const enteredAt = useRef(0);
  const animation = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef({ catalog, entry });
  latest.current = { catalog, entry };
  const key = effectPosterKey(entry);
  const duration = useMemo(
    () => parseEffectV1Source(entry.source).document?.duration ?? 4,
    [entry.source]
  );
  const stop = () => {
    if (animation.current !== null) clearInterval(animation.current);
    animation.current = null;
    if (source.current) {
      source.current.width = 0;
      source.current.height = 0;
      source.current = null;
    }
  };
  useEffect(() => {
    const target = canvas.current;
    if (!target || !queue) return;
    const session = createEffectPreviewSession({
      target,
      queue,
      key,
      readDocument: () => latest.current,
      readSource: () => source.current,
    });
    request.current = session.render;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        session.render(0.5, true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => {
      session.dispose();
      request.current = () => undefined;
      observer.disconnect();
      stop();
    };
  }, [key, queue]);
  return (
    <canvas
      ref={canvas}
      className={[
        'block aspect-video h-auto max-h-20 w-full rounded-[4px] object-contain',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      aria-hidden="true"
      onPointerEnter={(event) => {
        stop();
        enteredAt.current = event.clientX;
        source.current = captureFrame?.() ?? null;
        request.current(0);
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const started = performance.now();
        animation.current = setInterval(
          () =>
            request.current(
              effectPreviewProgress(
                ((performance.now() - started) / 4000) % 1,
                duration,
                entry.kind
              )
            ),
          1000 / 15
        );
      }}
      onPointerMove={(event) => {
        if (animation.current !== null && Math.abs(event.clientX - enteredAt.current) < 3) return;
        if (animation.current !== null) clearInterval(animation.current);
        animation.current = null;
        const bounds = event.currentTarget.getBoundingClientRect();
        request.current(
          effectPreviewProgress(
            (event.clientX - bounds.left) / Math.max(1, bounds.width),
            duration,
            entry.kind
          )
        );
      }}
      onPointerLeave={() => {
        stop();
        request.current(0.5, true);
      }}
    />
  );
}
