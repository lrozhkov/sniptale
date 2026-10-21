import { resolveVideoProjectCompositionJoinPlans } from '../../../../features/video/project/scene/joins';
import { drawVideoProjectSceneEdges } from '../../../../features/video/composition/canvas/scene-edges';
import type { VideoProjectExportTimeEstimate } from '../../../../features/video/project/types/export';
import { getProjectExportFrameOptions } from '../../../../features/video/project/export/encoding-quality';
import { translate } from '../../../../platform/i18n';
import { createVideoCompositionTimelineIndex } from '../../../../features/video/composition/timeline/frame/index';
import { VideoProjectExportPhase } from '../../../../features/video/project/types/export';
import { waitForEncoderQueueCapacity } from '../../codecs';
import { renderProjectCompositionScene } from '../../composition-scene';
import {
  createOffscreenProjectEffectRuntime,
  type OffscreenProjectEffectRuntime,
} from '../../effect-runtime';
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
  onFrameSubmitted?: () => void;
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
      ...getProjectExportFrameOptions(args.request.settings),
      keyFrame: args.frameIndex === 0 || args.frameIndex % args.keyframeInterval === 0,
    });
    args.request.onFrameSubmitted?.();
  } finally {
    frame.close();
  }
}

async function sendAcceleratedCompositeProgress(args: {
  frameIndex: number;
  jobId: string;
  range?: { start: number; end: number };
  totalFrames: number;
  timeEstimate?: VideoProjectExportTimeEstimate | null;
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
    (args.range?.start ?? 0) +
      ((args.frameIndex + 1) / Math.max(1, args.totalFrames)) *
        ((args.range?.end ?? 100) - (args.range?.start ?? 0)),
    [
      translate('offscreenExport.hybridAcceleratedCompositeRender'),
      `${args.frameIndex + 1}`,
      translate('offscreenExport.progressFrameOf'),
      `${args.totalFrames}`,
    ].join(' '),
    ...(args.timeEstimate ? [args.timeEstimate] : [])
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
    args.job.timeEstimator?.resume();
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
    const timeEstimate = args.request.job.timeEstimator?.observe(
      Math.min(args.request.span.end, args.projectTime + 1 / args.frameTimes.timing.fps)
    );
    await sendAcceleratedCompositeProgress({
      ...(timeEstimate ? { timeEstimate } : {}),
      ...(args.request.job.renderProgressRange
        ? { range: args.request.job.renderProgressRange }
        : {}),
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
  const { project } = args.request;
  const ownerDocument = getDecodedCompositeOwnerDocument(args);
  await renderProjectCompositionScene({
    ...args.request,
    currentTime: args.projectTime,
    clipMediaElements,
    compositionIndex: args.compositionIndex,
    effectRuntime: args.effectRuntime,
    backgroundCache: args.backgroundCache,
    ...(ownerDocument ? { ownerDocument } : {}),
  });
  drawVideoProjectSceneEdges(args.request.context, project, args.projectTime);
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
  if (
    resolveVideoProjectCompositionJoinPlans(args.project).some(
      (plan) => args.span.start < plan.seam + plan.after && args.span.end > plan.seam - plan.before
    )
  )
    return false;
  if (typeof VideoFrame === 'undefined') {
    return false;
  }

  const frameTimes = createFrameTimes(args.span, args.settings.fps);
  const providers = await createWebmFrameProviders(
    args.project,
    frameTimes.projectTimes,
    args.signal
  );
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
