import type { LoadedImagesMap } from '../../renderer';
import { resolveProjectExportRange } from '../../../../features/video/project/export/range';
import { createVideoCompositionTimelineIndex } from '../../../../features/video/composition/timeline/frame/index';
import { type VideoProjectExportSettings } from '../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../features/video/project/types/model';
import {
  createOffscreenProjectEffectRuntime,
  type OffscreenProjectEffectRuntime,
} from '../../effect-runtime';
import { pauseRenderLoopMediaElements } from '../shared/media';
import type { RenderLoopJobState } from '../shared/types';
import { getFrameDrivenRenderCurrentTime, getFrameDrivenRenderTiming } from './timing';
import { renderFrameDrivenCompositeFrame } from './render/index';
import { maybeSendFrameDrivenProgress } from './progress';

interface FrameDrivenLoopFrameArgs {
  canvas: HTMLCanvasElement;
  compositionIndex: ReturnType<typeof createVideoCompositionTimelineIndex>;
  context: CanvasRenderingContext2D;
  duration: number;
  exportStart: number;
  fps: number;
  frameDurationUs: number;
  frameIndex: number;
  job: RenderLoopJobState;
  keyframeInterval: number;
  loadedImages: LoadedImagesMap;
  effectRuntime: OffscreenProjectEffectRuntime;
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  throwIfPipelineFailed: () => void;
  timestampOffsetUs: number;
  videoEncoder: VideoEncoder;
}

interface FrameDrivenLoopFramesArgs extends Omit<FrameDrivenLoopFrameArgs, 'frameIndex'> {
  progressMessageDetail?: string;
  totalFrames: number;
}

function sendLoopProgress(args: {
  fps: number;
  frameIndex: number;
  job: RenderLoopJobState;
  lastProgressFrame: number;
  progressMessageDetail?: string;
  totalFrames: number;
}): Promise<number> {
  return maybeSendFrameDrivenProgress({
    fps: args.fps,
    frameIndex: args.frameIndex,
    job: args.job,
    lastProgressFrame: args.lastProgressFrame,
    ...(args.progressMessageDetail === undefined
      ? {}
      : { messageDetail: args.progressMessageDetail }),
    totalFrames: args.totalFrames,
  });
}

function getLoopCurrentTime(
  exportStart: number,
  frameIndex: number,
  fps: number,
  duration: number
) {
  return exportStart + getFrameDrivenRenderCurrentTime(frameIndex, fps, duration);
}

function createFrameDrivenLoopModel(project: VideoProject, settings: VideoProjectExportSettings) {
  const exportRange = resolveProjectExportRange(project, settings);
  return {
    compositionIndex: createVideoCompositionTimelineIndex(project),
    exportRange,
    timing: getFrameDrivenRenderTiming(exportRange.duration, settings.fps),
  };
}

export async function runFrameDrivenCompositeRenderLoop(
  job: RenderLoopJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  loadedImages: LoadedImagesMap,
  videoEncoder: VideoEncoder,
  throwIfPipelineFailed: () => void,
  signal?: AbortSignal,
  timestampOffsetUs = 0,
  progressMessageDetail?: string
): Promise<void> {
  const { compositionIndex, exportRange, timing } = createFrameDrivenLoopModel(project, settings);
  const { duration, fps, frameDurationUs, keyframeInterval, totalFrames } = timing;
  const effectRuntime = createOffscreenProjectEffectRuntime({
    ownerDocument: canvas.ownerDocument,
  });

  try {
    await renderFrameDrivenLoopFrames({
      canvas,
      compositionIndex,
      context,
      duration,
      effectRuntime,
      exportStart: exportRange.start,
      fps,
      frameDurationUs,
      job,
      keyframeInterval,
      loadedImages,
      project,
      settings,
      timestampOffsetUs,
      throwIfPipelineFailed,
      totalFrames,
      videoEncoder,
      ...(progressMessageDetail === undefined ? {} : { progressMessageDetail }),
      ...(signal === undefined ? {} : { signal }),
    });
  } finally {
    effectRuntime.dispose();
  }
}

async function renderFrameDrivenLoopFrames(args: FrameDrivenLoopFramesArgs): Promise<void> {
  let lastProgressFrame = -1;
  await pauseRenderLoopMediaElements(args.job);
  for (let frameIndex = 0; frameIndex < args.totalFrames; frameIndex += 1) {
    await renderFrameDrivenLoopFrame({ ...args, frameIndex });
    lastProgressFrame = await sendLoopProgress({
      fps: args.fps,
      frameIndex,
      job: args.job,
      lastProgressFrame,
      ...(args.progressMessageDetail === undefined
        ? {}
        : { progressMessageDetail: args.progressMessageDetail }),
      totalFrames: args.totalFrames,
    });
  }
}

async function renderFrameDrivenLoopFrame(args: FrameDrivenLoopFrameArgs): Promise<void> {
  await renderFrameDrivenCompositeFrame({
    canvas: args.canvas,
    context: args.context,
    compositionIndex: args.compositionIndex,
    currentTime: getLoopCurrentTime(args.exportStart, args.frameIndex, args.fps, args.duration),
    effectRuntime: args.effectRuntime,
    frameDurationUs: args.frameDurationUs,
    frameIndex: args.frameIndex,
    job: args.job,
    keyframeInterval: args.keyframeInterval,
    loadedImages: args.loadedImages,
    project: args.project,
    settings: args.settings,
    timestampOffsetUs: args.timestampOffsetUs,
    throwIfPipelineFailed: args.throwIfPipelineFailed,
    videoEncoder: args.videoEncoder,
    ...(args.signal === undefined ? {} : { signal: args.signal }),
  });
}
