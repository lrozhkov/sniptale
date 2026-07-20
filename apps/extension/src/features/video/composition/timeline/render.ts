import type { VideoProject } from '../../project/types/index';
import { clampNumber } from '../../project/hydration';
import { resolveTransitionOverlays } from '../../project/transition/presentation';
import {
  createVideoCompositionTimelineIndex,
  resolveVideoCompositionFrame,
  type VideoCompositionTimelineIndex,
} from './frame/index';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../types';

const MIN_MOTION_BLUR_WINDOW_SECONDS = 1 / 120;
const MAX_MOTION_BLUR_WINDOW_SECONDS = 1 / 24;
const MAX_MOTION_BLUR_SAMPLES = 5;
const MIN_MEANINGFUL_VIEWPORT_DELTA = 0.35;
const MIN_MEANINGFUL_SCALE_DELTA = 0.0025;

function resolveMotionBlurSampleCount(amount: number): number {
  return Math.max(1, Math.min(MAX_MOTION_BLUR_SAMPLES, 1 + Math.round(amount * 2) * 2));
}

function resolveMotionBlurWindowSeconds(amount: number): number {
  return clampNumber(amount * 0.08, MIN_MOTION_BLUR_WINDOW_SECONDS, MAX_MOTION_BLUR_WINDOW_SECONDS);
}

function buildMotionBlurSampleTimes(project: VideoProject, currentTime: number, amount: number) {
  const sampleCount = resolveMotionBlurSampleCount(amount);
  if (sampleCount <= 1 || amount <= 0) {
    return [currentTime];
  }

  const shutterWindowSeconds = resolveMotionBlurWindowSeconds(amount);
  const halfWindowSeconds = shutterWindowSeconds / 2;

  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const offset = -halfWindowSeconds + progress * shutterWindowSeconds;
    return clampNumber(currentTime + offset, 0, Math.max(project.duration, currentTime));
  });
}

function buildMotionBlurPassAlphas(sampleCount: number): number[] {
  if (sampleCount <= 1) {
    return [1];
  }

  const midpoint = (sampleCount - 1) / 2;
  const weights = Array.from(
    { length: sampleCount },
    (_, index) => midpoint + 1 - Math.abs(index - midpoint)
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / totalWeight);
}

function hasMeaningfulMotionBlurSpread(
  overlayFrame: VideoCompositionFrame,
  passes: VideoCompositionVisualPass[]
) {
  return passes.some(
    ({ frame }) =>
      Math.abs(frame.camera.scale - overlayFrame.camera.scale) > MIN_MEANINGFUL_SCALE_DELTA ||
      Math.abs(frame.camera.viewportX - overlayFrame.camera.viewportX) >
        MIN_MEANINGFUL_VIEWPORT_DELTA ||
      Math.abs(frame.camera.viewportY - overlayFrame.camera.viewportY) >
        MIN_MEANINGFUL_VIEWPORT_DELTA
  );
}

function resolveRenderFrameOptions(
  project: VideoProject,
  options: { includeSubtitles?: boolean; timelineIndex?: VideoCompositionTimelineIndex }
) {
  const timelineIndex = options.timelineIndex ?? createVideoCompositionTimelineIndex(project);
  return {
    ...(options.includeSubtitles === undefined
      ? {}
      : { includeSubtitles: options.includeSubtitles }),
    timelineIndex,
  };
}

function createVisualPass(params: {
  alpha: number;
  currentTime: number;
  frame?: VideoCompositionFrame;
  frameOptions: ReturnType<typeof resolveRenderFrameOptions>;
  project: VideoProject;
}): VideoCompositionVisualPass {
  return {
    alpha: params.alpha,
    frame:
      params.frame ??
      resolveVideoCompositionFrame(params.project, params.currentTime, params.frameOptions),
    time: params.currentTime,
    transitionOverlays: resolveTransitionOverlays(params.project, params.currentTime),
  };
}

function createSingleVisualPassResult(params: {
  currentTime: number;
  frameOptions: ReturnType<typeof resolveRenderFrameOptions>;
  overlayFrame: VideoCompositionFrame;
  project: VideoProject;
}): {
  overlayFrame: VideoCompositionFrame;
  visualPasses: VideoCompositionVisualPass[];
} {
  return {
    overlayFrame: params.overlayFrame,
    visualPasses: [
      createVisualPass({
        alpha: 1,
        currentTime: params.currentTime,
        frame: params.overlayFrame,
        frameOptions: params.frameOptions,
        project: params.project,
      }),
    ],
  };
}

export function resolveVideoCompositionRenderPasses(
  project: VideoProject,
  currentTime: number,
  options: { includeSubtitles?: boolean; timelineIndex?: VideoCompositionTimelineIndex } = {}
): {
  overlayFrame: VideoCompositionFrame;
  visualPasses: VideoCompositionVisualPass[];
} {
  const frameOptions = resolveRenderFrameOptions(project, options);
  const overlayFrame = resolveVideoCompositionFrame(project, currentTime, frameOptions);
  const motionBlurAmount = overlayFrame.camera.motionBlurAmount;

  if (motionBlurAmount <= 0 || overlayFrame.camera.regionId === null) {
    return createSingleVisualPassResult({ currentTime, frameOptions, overlayFrame, project });
  }

  const sampleTimes = buildMotionBlurSampleTimes(project, currentTime, motionBlurAmount);
  const passAlphas = buildMotionBlurPassAlphas(sampleTimes.length);
  const visualPasses = sampleTimes.map((time, index) =>
    createVisualPass({
      alpha: passAlphas[index] ?? 0,
      currentTime: time,
      frameOptions,
      project,
    })
  );

  if (!hasMeaningfulMotionBlurSpread(overlayFrame, visualPasses)) {
    return createSingleVisualPassResult({ currentTime, frameOptions, overlayFrame, project });
  }

  return { overlayFrame, visualPasses };
}
