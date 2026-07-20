import { type LoadedImagesMap, drawProjectFrame } from '../../../renderer';
import type { VideoCompositionTimelineIndex } from '../../../../../features/video/composition/timeline/frame/index';
import { syncClipPlayback } from '../../../media';
import { type VideoProjectExportSettings } from '../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../features/video/project/types/model';
import type { RenderLoopJobState } from '../../shared/index';
import {
  renderOffscreenProjectEffectFrames,
  type OffscreenProjectEffectRuntime,
} from '../../../effect-runtime';
import { disposeEffectRuntimeComposition } from '../../../../../features/video/composition/effect-runtime';
import { sendCompositeRenderProgress } from '../../progress/index';

type RenderCompositeFrameArgs = {
  context: CanvasRenderingContext2D;
  currentTime: number;
  frameIndex: number;
  job: RenderLoopJobState;
  loadedImages: LoadedImagesMap;
  effectRuntime?: OffscreenProjectEffectRuntime;
  compositionIndex?: VideoCompositionTimelineIndex;
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  lastProgressSent: number;
  totalFrames: number;
};

export async function renderCompositeFrame(args: RenderCompositeFrameArgs): Promise<number | null> {
  const {
    compositionIndex,
    context,
    currentTime,
    frameIndex,
    job,
    loadedImages,
    project,
    settings,
    signal,
  } = args;

  if (job.cancelled || signal?.aborted) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }

  syncClipPlayback(job, project, currentTime);
  const effectRuntimeFrames = await renderCompositeEffectFrames(args);
  try {
    if (job.cancelled || signal?.aborted) {
      throw new Error('PROJECT_EXPORT_CANCELLED');
    }
    const frameOptions = {
      ...(compositionIndex ? { compositionIndex } : {}),
      ...(effectRuntimeFrames ? { effectRuntimeFrames } : {}),
    };
    drawProjectFrame(
      context,
      project,
      settings,
      currentTime,
      loadedImages,
      job.clipMediaElements,
      frameOptions
    );
  } finally {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
  }

  return sendCompositeRenderProgress({
    currentFrame: frameIndex + 1,
    totalFrames: args.totalFrames,
    format: settings.format,
    jobId: job.jobId,
    lastProgressSent: args.lastProgressSent,
  });
}

function renderCompositeEffectFrames(args: RenderCompositeFrameArgs) {
  const ownerDocument =
    typeof HTMLCanvasElement !== 'undefined' && args.context.canvas instanceof HTMLCanvasElement
      ? args.context.canvas.ownerDocument
      : undefined;
  const frameArgs = {
    ...(args.compositionIndex ? { compositionIndex: args.compositionIndex } : {}),
    clipMediaElements: args.job.clipMediaElements,
    currentTime: args.currentTime,
    loadedImages: args.loadedImages,
    ...(ownerDocument ? { ownerDocument } : {}),
    project: args.project,
  };
  return args.effectRuntime
    ? args.effectRuntime.renderProjectFrames(frameArgs)
    : renderOffscreenProjectEffectFrames(frameArgs);
}
