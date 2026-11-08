import type { PreviewScenePresentation } from '../stage/scene/types';
import type { GpuPreviewOutput } from '../../../features/video/composition/canvas/preview-presentation';
import type { VideoEditorPreviewMode } from '../../contracts/preview-runtime';
import type { renderPreviewScene } from '../stage/scene/render-preview';
import { createMaterializerGpuComposer } from './materializer-gpu';
import {
  createVideoPreviewExactFrameKey,
  type VideoPreviewExactFrameCache,
} from './exact-frame-cache';

type PreviewRenderParams = Parameters<typeof renderPreviewScene>[0] & {
  previewMode?: VideoEditorPreviewMode;
  renderRevision?: Promise<string>;
};
interface ExactCacheRenderParams {
  cache: VideoPreviewExactFrameCache;
  job: PreviewRenderParams;
  render: typeof renderPreviewScene;
  presentCached?(
    bitmap: ImageBitmap,
    presentation: PreviewScenePresentation,
    job: PreviewRenderParams
  ): Promise<PreviewScenePresentation | undefined>;
}

function resolveFrameIndex(time: number, fps: number): number {
  return Math.max(0, Math.round(Math.max(0, time) * Math.max(1, fps)));
}

function presentCachedFrame(canvas: HTMLCanvasElement, bitmap: ImageBitmap): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return true;
}

/** Owns the optional cached-image GPU provider; the frontend owns completed output leases. */
export function createVideoPreviewExactFrameRenderer() {
  let disposed = false;
  let session: {
    key: string;
    composer: ReturnType<typeof createMaterializerGpuComposer>;
  } | null = null;
  const clear = () => {
    const previous = session;
    session = null;
    previous?.composer.dispose();
  };
  const presentCached: NonNullable<ExactCacheRenderParams['presentCached']> = async (
    bitmap,
    presentation,
    job
  ) => {
    if (job.previewRenderer === 'legacy' || !job.acquireGpuOutput)
      return { ...presentation, renderer: { backend: 'legacy' } };
    const size = { width: bitmap.width, height: bitmap.height };
    const key = `${size.width}x${size.height}`;
    if (session?.key !== key) {
      clear();
      session = {
        key,
        composer: createMaterializerGpuComposer(size, () => disposed),
      };
    }
    const current = session;
    const output = await current.composer.present(
      [
        {
          source: bitmap,
          rect: { x: 0, y: 0, ...size },
          inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          clampSourceEdges: ['left', 'top', 'right', 'bottom'],
          cache: { key: 'native-exact-frame', revision: bitmap },
        },
      ],
      job.signal ?? new AbortController().signal,
      job.acquireGpuOutput
    );
    return output
      ? { ...presentation, output, renderer: { backend: 'gpu' } }
      : {
          ...presentation,
          renderer: {
            backend: 'legacy',
            fallback: current.composer.fallbackReason,
          },
        };
  };
  return {
    clear,
    dispose() {
      disposed = true;
      clear();
    },
    render(params: Omit<ExactCacheRenderParams, 'presentCached'>) {
      if (disposed) throw new Error('Exact preview renderer is disposed.');
      return renderPreviewSceneWithExactCache({ ...params, presentCached });
    },
  };
}

/** Cache readers and untransferred GPU results remain owned until all asynchronous work settles. */
export async function renderPreviewSceneWithExactCache(
  params: ExactCacheRenderParams
): Promise<PreviewScenePresentation | void | false> {
  const { job } = params;
  if (
    job.previewMode !== 'cache' ||
    job.previewCacheBypass ||
    !job.renderRevision ||
    !job.previewRasterSize
  ) {
    return params.render(job);
  }
  const renderRevision = await job.renderRevision;
  if (job.signal?.aborted) return false;
  const key = createVideoPreviewExactFrameKey({
    fps: job.project.fps,
    frameIndex: resolveFrameIndex(job.currentTime, job.project.fps),
    height: job.previewRasterSize.height,
    renderRevision,
    width: job.previewRasterSize.width,
  });
  let output: GpuPreviewOutput | undefined;
  let handedOff = false;
  try {
    let cachedResult: PreviewScenePresentation | undefined;
    const lease = params.cache.acquire(key);
    try {
      if (
        lease?.presentation &&
        lease.bitmap.width === job.previewRasterSize.width &&
        lease.bitmap.height === job.previewRasterSize.height
      ) {
        const completed = await params.presentCached?.(lease.bitmap, lease.presentation, job);
        output = completed?.output;
        if (job.signal?.aborted) return false;
        if (output || presentCachedFrame(job.canvas, lease.bitmap))
          cachedResult = completed ?? lease.presentation;
      }
    } finally {
      lease?.release();
    }
    if (cachedResult) {
      handedOff = true;
      return cachedResult;
    }
    const presented = await params.render(job);
    if (presented === false) return false;
    if (presented) output = presented.output;
    if (job.signal?.aborted) return false;
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(output?.canvas ?? job.canvas);
      if (job.signal?.aborted) {
        bitmap.close();
        return false;
      }
      params.cache.set(key, bitmap, presented || undefined);
    }
    handedOff = true;
    return presented;
  } finally {
    if (!handedOff) output?.release();
  }
}
