import type { VideoProject } from '../../project/types/index';
import { motionBlurSamples } from '../motion/blur';
import { resolveTransitionOverlays } from '../../project/transition/presentation';
import {
  createVideoCompositionTimelineIndex,
  resolveVideoCompositionFrame,
  type VideoCompositionTimelineIndex,
} from './frame/index';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../types';

function hasMeaningfulMotionBlurSpread(
  overlayFrame: VideoCompositionFrame,
  passes: VideoCompositionVisualPass[]
) {
  return passes.some(
    ({ frame }) =>
      Math.abs(frame.camera.scale - overlayFrame.camera.scale) > 1e-7 ||
      Math.abs(frame.camera.viewportX - overlayFrame.camera.viewportX) > 1e-7 ||
      Math.abs(frame.camera.viewportY - overlayFrame.camera.viewportY) > 1e-7
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

  const samples = motionBlurSamples(
    currentTime,
    motionBlurAmount,
    0,
    Math.max(project.duration, currentTime)
  );
  const visualPasses = samples.map(({ time, alpha }) =>
    createVisualPass({
      alpha,
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
