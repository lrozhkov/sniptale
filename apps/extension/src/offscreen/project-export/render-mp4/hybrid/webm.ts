import { translate } from '../../../../platform/i18n';
import { createVideoCompositionTimelineIndex } from '../../../../features/video/composition/timeline/frame/index';
import { VideoProjectExportPhase } from '../../../../features/video/project/types/export';
import { waitForEncoderQueueCapacity } from '../../codecs';
import { drawProjectFrame } from '../../renderer';
import {
  createOffscreenProjectEffectRuntime,
  type OffscreenProjectEffectRuntime,
} from '../../effect-runtime';
import { disposeEffectRuntimeComposition } from '../../../../features/video/composition/effect-runtime';
import type { ExportSceneBackgroundCache } from '../../renderer/background';
import { pauseRenderLoopMediaElements } from '../../render-loop/shared/media';
import {
  getFrameDrivenRenderCurrentTime,
  getFrameDrivenRenderTiming,
} from '../../render-loop/frame-driven/timing';
import { sendProgress } from '../../runtime';
import type { Mp4AcceleratedCompositeRenderSpan, Mp4HybridVideoPipelineArgs } from './types';
import {
  createWebmFrameProviders,
  prepareWebmProviderFrames,
  type WebmFrameProvider,
} from './webm-provider';

const WEBM_SOURCE_ENCODER_QUEUE_CAPACITY = 6;

interface AcceleratedCompositeWebmRenderArgs extends Pick<
  Mp4HybridVideoPipelineArgs,
  | 'canvas'
  | 'context'
  | 'job'
  | 'loadedImages'
  | 'project'
  | 'settings'
  | 'throwIfPipelineFailed'
  | 'videoEncoder'
> {
  signal?: AbortSignal;
  span: Mp4AcceleratedCompositeRenderSpan;
}

interface DecodedCompositeFrameArgs {
  backgroundCache: ExportSceneBackgroundCache;
  compositionIndex: ReturnType<typeof createVideoCompositionTimelineIndex>;
  frameIndex: number;
  frameTimes: ReturnType<typeof createFrameTimes>;
  effectRuntime: OffscreenProjectEffectRuntime;
  projectTime: number;
  providers: WebmFrameProvider[];
  request: AcceleratedCompositeWebmRenderArgs;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException('The export was aborted.', 'AbortError');
  }
}

function createFrameTimes(span: Mp4AcceleratedCompositeRenderSpan, fps: number) {
  const timing = getFrameDrivenRenderTiming(span.end - span.start, fps);
  const projectTimes: number[] = [];
  for (let frameIndex = 0; frameIndex < timing.totalFrames; frameIndex += 1) {
    projectTimes.push(
      span.start + getFrameDrivenRenderCurrentTime(frameIndex, timing.fps, timing.duration)
    );
  }

  return { projectTimes, timing };
}

async function encodeRenderedWebmFrame(args: {
  frameDurationUs: number;
  frameIndex: number;
  keyframeInterval: number;
  request: AcceleratedCompositeWebmRenderArgs;
  timestampUs: number;
}) {
  const frame = new VideoFrame(args.request.canvas, {
    duration: args.frameDurationUs,
    timestamp: args.timestampUs,
  });
  try {
    await waitForEncoderQueueCapacity(
      args.request.videoEncoder,
      WEBM_SOURCE_ENCODER_QUEUE_CAPACITY,
      args.request.signal
    );
    args.request.videoEncoder.encode(frame, {
      keyFrame: args.frameIndex === 0 || args.frameIndex % args.keyframeInterval === 0,
    });
  } finally {
    frame.close();
  }
}

async function sendAcceleratedCompositeProgress(args: {
  frameIndex: number;
  jobId: string;
  totalFrames: number;
}) {
  if (
    args.frameIndex !== args.totalFrames - 1 &&
    args.frameIndex % Math.max(1, Math.floor(args.totalFrames / 20)) !== 0
  ) {
    return;
  }

  await sendProgress(
    args.jobId,
    VideoProjectExportPhase.RENDERING,
    ((args.frameIndex + 1) / Math.max(1, args.totalFrames)) * 100,
    [
      translate('offscreenExport.hybridAcceleratedCompositeRender'),
      `${args.frameIndex + 1}`,
      translate('offscreenExport.progressFrameOf'),
      `${args.totalFrames}`,
    ].join(' ')
  );
}

async function renderDecodedCompositeFrames(
  args: AcceleratedCompositeWebmRenderArgs,
  providers: WebmFrameProvider[],
  frameTimes: ReturnType<typeof createFrameTimes>
): Promise<void> {
  const backgroundCache: ExportSceneBackgroundCache = { buffer: null, key: null };
  const compositionIndex = createVideoCompositionTimelineIndex(args.project);
  const effectRuntime = createOffscreenProjectEffectRuntime();
  try {
    for (const [frameIndex, projectTime] of frameTimes.projectTimes.entries()) {
      await renderDecodedCompositeFrame({
        backgroundCache,
        compositionIndex,
        effectRuntime,
        frameIndex,
        frameTimes,
        projectTime,
        providers,
        request: args,
      });
    }
  } finally {
    effectRuntime.dispose();
  }
}

async function renderDecodedCompositeFrame(args: DecodedCompositeFrameArgs): Promise<void> {
  throwIfAborted(args.request.signal);
  args.request.throwIfPipelineFailed();
  const frames = await prepareWebmProviderFrames(args.providers, args.frameIndex);
  try {
    await drawDecodedCompositeFrame(args, frames);
    await encodeRenderedWebmFrame({
      frameDurationUs: args.frameTimes.timing.frameDurationUs,
      frameIndex: args.frameIndex,
      keyframeInterval: args.frameTimes.timing.keyframeInterval,
      request: args.request,
      timestampUs: Math.round(args.projectTime * 1_000_000),
    });
    await sendAcceleratedCompositeProgress({
      frameIndex: args.frameIndex,
      jobId: args.request.job.jobId,
      totalFrames: args.frameTimes.timing.totalFrames,
    });
  } finally {
    for (const frame of frames) {
      frame.release();
    }
  }
}

async function drawDecodedCompositeFrame(
  args: DecodedCompositeFrameArgs,
  frames: Awaited<ReturnType<typeof prepareWebmProviderFrames>>
): Promise<void> {
  const clipMediaElements = new Map(frames.map((frame) => [frame.clipId, frame.source]));
  const ownerDocument = getDecodedCompositeOwnerDocument(args);
  const effectRuntimeFrames = await args.effectRuntime.renderProjectFrames({
    clipMediaElements,
    compositionIndex: args.compositionIndex,
    currentTime: args.projectTime,
    loadedImages: args.request.loadedImages,
    ...(ownerDocument ? { ownerDocument } : {}),
    project: args.request.project,
  });
  try {
    throwIfAborted(args.request.signal);
    drawProjectFrame(
      args.request.context,
      args.request.project,
      args.request.settings,
      args.projectTime,
      args.request.loadedImages,
      clipMediaElements,
      {
        backgroundCache: args.backgroundCache,
        compositionIndex: args.compositionIndex,
        ...(effectRuntimeFrames ? { effectRuntimeFrames } : {}),
      }
    );
  } finally {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
  }
}

function getDecodedCompositeOwnerDocument(args: DecodedCompositeFrameArgs): Document | undefined {
  return typeof HTMLCanvasElement !== 'undefined' &&
    args.request.context.canvas instanceof HTMLCanvasElement
    ? args.request.context.canvas.ownerDocument
    : undefined;
}

export async function renderAcceleratedCompositeWebmSpan(
  args: AcceleratedCompositeWebmRenderArgs
): Promise<boolean> {
  if (typeof VideoFrame === 'undefined') {
    return false;
  }

  const frameTimes = createFrameTimes(args.span, args.settings.fps);
  const providers = await createWebmFrameProviders(args.project, frameTimes.projectTimes);
  if (!providers) {
    return false;
  }

  try {
    await pauseRenderLoopMediaElements(args.job);
    await renderDecodedCompositeFrames(args, providers, frameTimes);
    args.throwIfPipelineFailed();
    return true;
  } finally {
    for (const provider of providers) {
      provider.dispose();
    }
  }
}
