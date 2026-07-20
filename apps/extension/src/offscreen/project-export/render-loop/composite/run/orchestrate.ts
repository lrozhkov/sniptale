import { type LoadedImagesMap } from '../../../renderer';
import { waitForDelay } from '../../../runtime';
import { resolveProjectExportRange } from '../../../../../features/video/project/export/range';
import { createVideoCompositionTimelineIndex } from '../../../../../features/video/composition/timeline/frame/index';
import { type VideoProjectExportSettings } from '../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../features/video/project/types/model';
import {
  getRenderLoopCurrentTime,
  getRenderLoopDuration,
  getRenderLoopFps,
  getRenderLoopTotalFrames,
} from '../../shared/timing';
import { pauseRenderLoopMediaElements } from '../../shared/media';
import {
  createOffscreenProjectEffectRuntime,
  type OffscreenProjectEffectRuntime,
} from '../../../effect-runtime';
import type { RenderLoopJobState } from '../../shared/types';
import { renderCompositeFrame } from './frame';

interface CompositeLoopFrameArgs {
  context: CanvasRenderingContext2D;
  compositionIndex: ReturnType<typeof createVideoCompositionTimelineIndex>;
  duration: number;
  exportStart: number;
  fps: number;
  frameIndex: number;
  frameIntervalMs: number;
  job: RenderLoopJobState;
  lastProgressSent: number;
  loadedImages: LoadedImagesMap;
  effectRuntime: OffscreenProjectEffectRuntime;
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  startedAt: number;
  totalFrames: number;
}

type CompositeLoopFramesArgs = Omit<CompositeLoopFrameArgs, 'frameIndex' | 'lastProgressSent'>;

export async function runCompositeRenderLoop(
  job: RenderLoopJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  context: CanvasRenderingContext2D,
  loadedImages: LoadedImagesMap,
  signal?: AbortSignal
): Promise<void> {
  const exportRange = resolveProjectExportRange(project, settings);
  const duration = getRenderLoopDuration(exportRange.duration);
  const fps = getRenderLoopFps(settings.fps);
  const totalFrames = getRenderLoopTotalFrames(duration, fps);
  const compositionIndex = createVideoCompositionTimelineIndex(project);
  const startedAt = performance.now();
  const frameIntervalMs = 1000 / fps;
  const effectRuntime = createOffscreenProjectEffectRuntime();

  try {
    await renderCompositeLoopFrames({
      context,
      compositionIndex,
      duration,
      exportStart: exportRange.start,
      effectRuntime,
      fps,
      frameIntervalMs,
      job,
      loadedImages,
      project,
      settings,
      startedAt,
      totalFrames,
      ...(signal === undefined ? {} : { signal }),
    });
  } finally {
    effectRuntime.dispose();
  }
}

async function renderCompositeLoopFrames(args: CompositeLoopFramesArgs): Promise<void> {
  let lastProgressSent = 0;
  await pauseRenderLoopMediaElements(args.job);
  for (let frameIndex = 0; frameIndex < args.totalFrames; frameIndex += 1) {
    if (args.job.cancelled || args.signal?.aborted) {
      throw new Error('PROJECT_EXPORT_CANCELLED');
    }
    const nextProgressTimestamp = await renderCompositeLoopFrame({
      ...args,
      frameIndex,
      lastProgressSent,
    });
    if (nextProgressTimestamp !== null) {
      lastProgressSent = nextProgressTimestamp;
    }
    if (frameIndex === args.totalFrames - 1) return;
  }
}

async function renderCompositeLoopFrame(args: CompositeLoopFrameArgs): Promise<number | null> {
  const currentTime =
    args.exportStart + getRenderLoopCurrentTime(args.frameIndex, args.fps, args.duration);
  const nextProgressTimestamp = await renderCompositeFrame({
    context: args.context,
    compositionIndex: args.compositionIndex,
    currentTime,
    effectRuntime: args.effectRuntime,
    frameIndex: args.frameIndex,
    job: args.job,
    lastProgressSent: args.lastProgressSent,
    loadedImages: args.loadedImages,
    project: args.project,
    settings: args.settings,
    totalFrames: args.totalFrames,
    ...(args.signal === undefined ? {} : { signal: args.signal }),
  });
  if (args.frameIndex !== args.totalFrames - 1) {
    const nextFrameAt = args.startedAt + (args.frameIndex + 1) * args.frameIntervalMs;
    await waitForDelay(Math.max(0, nextFrameAt - performance.now()), args.signal);
  }
  return nextProgressTimestamp;
}
