import type { VideoEditorPreviewMode } from '../../contracts/preview-runtime';
import type { renderPreviewScene } from '../stage/scene/render-preview';
import {
  createVideoPreviewExactFrameKey,
  type VideoPreviewExactFrameCache,
} from './exact-frame-cache';

type PreviewRenderParams = Parameters<typeof renderPreviewScene>[0] & {
  previewMode?: VideoEditorPreviewMode;
  renderRevision?: Promise<string>;
};

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

export async function renderPreviewSceneWithExactCache(params: {
  cache: VideoPreviewExactFrameCache;
  job: PreviewRenderParams;
  render: typeof renderPreviewScene;
}): Promise<void> {
  const { job } = params;
  if (
    job.previewMode !== 'cache' ||
    job.previewCacheBypass ||
    !job.renderRevision ||
    !job.previewRasterSize
  ) {
    await params.render(job);
    return;
  }
  const renderRevision = await job.renderRevision;
  if (job.signal?.aborted) return;
  const key = createVideoPreviewExactFrameKey({
    fps: job.project.fps,
    frameIndex: resolveFrameIndex(job.currentTime, job.project.fps),
    height: job.previewRasterSize.height,
    renderRevision,
    width: job.previewRasterSize.width,
  });
  const cached = params.cache.get(key);
  if (cached && presentCachedFrame(job.canvas, cached)) return;

  await params.render(job);
  if (job.signal?.aborted || typeof createImageBitmap !== 'function') return;
  const bitmap = await createImageBitmap(job.canvas);
  if (job.signal?.aborted) {
    bitmap.close();
    return;
  }
  params.cache.set(key, bitmap);
}
