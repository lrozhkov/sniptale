import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../../project/types/export';
import type { VideoProjectRenderScope } from '../../project/export/render-scope';
import { getClipPlaybackOffset, normalizeClipPlaybackRate } from '../../project/timeline/rate';
import { materializeVideoProjectCursorSourceObservations } from '../../project/cursor-source-observations';
import { getClipVisualOpacity } from '../../project/timeline/presentation.gain';
import { resolveClipTransitionVisualState } from '../../project/transition/presentation';
import type { VideoProjectClip, VideoProjectVideoClip } from '../../project/types';
import { resolveMotionSourcePlayback } from '../../project/motion/source-playback';
import { resolveVideoCompositionCamera } from '../motion';
import { resolveVideoCompositionActions } from './frame/actions';
import { resolveCursorSample } from './frame/cursor';
import { motionBlurSampleBounds } from '../motion/camera-interval';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import type { VideoProject } from '../../project/types/index';
import { motionBlurSamples } from '../motion/blur';
import { resolveTransitionOverlays } from '../../project/transition/presentation';
import {
  createVideoCompositionTimelineIndex,
  resolveVideoCompositionFrame,
  type VideoCompositionTimelineIndex,
} from './frame/index';
import type {
  VideoCompositionFrame,
  VideoCompositionVisualPass,
  VideoCompositionCameraState,
} from '../types';

function hasMeaningfulMotionBlurSpread(
  overlayFrame: VideoCompositionFrame,
  passes: VideoCompositionVisualPass[]
) {
  return passes.some(
    ({ frame }) =>
      Math.abs(frame.camera.scale - overlayFrame.camera.scale) > 1e-7 ||
      Math.abs(frame.camera.viewportX - overlayFrame.camera.viewportX) > 1e-7 ||
      Math.abs(frame.camera.viewportY - overlayFrame.camera.viewportY) > 1e-7 ||
      JSON.stringify(frame.camera.spatial) !== JSON.stringify(overlayFrame.camera.spatial)
  );
}

function resolveRenderFrameOptions(
  project: VideoProject,
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    cameraViewport?: CameraOutputViewport;
  }
) {
  const timelineIndex = options.timelineIndex ?? createVideoCompositionTimelineIndex(project);
  return {
    ...(options.includeSubtitles === undefined
      ? {}
      : { includeSubtitles: options.includeSubtitles }),
    timelineIndex,
    ...(options.cameraViewport ? { cameraViewport: options.cameraViewport } : {}),
  };
}

function createVisualPass(params: {
  alpha: number;
  currentTime: number;
  frame?: VideoCompositionFrame;
  cameraOverride?: VideoCompositionCameraState;
  frameOptions: ReturnType<typeof resolveRenderFrameOptions>;
  project: VideoProject;
  transitionProject?: VideoProject;
}): VideoCompositionVisualPass {
  return {
    alpha: params.alpha,
    frame:
      params.frame ??
      resolveVideoCompositionFrame(params.project, params.currentTime, {
        ...params.frameOptions,
        ...(params.cameraOverride ? { cameraOverride: params.cameraOverride } : {}),
      }),
    time: params.currentTime,
    transitionOverlays: resolveTransitionOverlays(
      params.transitionProject ?? params.project,
      params.currentTime
    ),
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

function createExposureProject(
  project: VideoProjectRenderScope,
  source: VideoProjectVideoClip,
  center: number,
  sample: number,
  delta: number
): VideoProjectRenderScope {
  if (delta === 0) return project;
  const sourceId = source.sourceInstanceId ?? source.id;
  const starts = new Map<string, number>();
  let changed = false;
  const clips = project.clips.map((clip): VideoProjectClip => {
    const window = clip.playbackWindow;
    const related =
      clip.type === 'VIDEO'
        ? clip.assetId === source.assetId && (clip.sourceInstanceId ?? clip.id) === sourceId
        : clip.type === 'EFFECT' &&
          clip.sourceRange?.assetId === source.assetId &&
          clip.sourceRange.sourceInstanceId === sourceId;
    if (!window || !related || center < clip.startTime || center >= clip.startTime + clip.duration)
      return clip;
    changed = true;
    const instance =
      clip.type === 'EFFECT'
        ? project.effectInstances?.find((item) => item.id === clip.effectInstanceId)
        : undefined;
    const limit =
      clip.type === 'VIDEO'
        ? clip.sourceDuration / normalizeClipPlaybackRate(clip.playbackRate ?? 1)
        : (instance?.duration ?? Infinity);
    const content =
      Math.min(limit, getClipPlaybackOffset(clip, center), window.holdAt ?? Infinity) + delta;
    if (content < 0 || content >= limit) {
      const startTime = sample + 1;
      if (clip.type === 'EFFECT') starts.set(clip.effectInstanceId, startTime);
      return { ...clip, startTime };
    }
    // A retained exposure can cross a physical cut or project start. This view is never saved or hydrated.
    const startTime = Math.min(clip.startTime, sample);
    const end = Math.max(clip.startTime + clip.duration, sample + 1e-9);
    const offset = Math.max(
      0,
      window.offset + startTime - clip.startTime,
      content - (sample - startTime)
    );
    if (clip.type === 'EFFECT') starts.set(clip.effectInstanceId, startTime);
    return {
      ...clip,
      startTime,
      duration: end - startTime,
      playbackWindow: {
        ...window,
        offset,
        holdAt: content,
        extent: Math.max(window.extent ?? window.offset + clip.duration, offset + end - startTime),
        ...(window.fadePhase
          ? {
              fadePhase: {
                ...window.fadePhase,
                offset: window.fadePhase.offset + offset - window.offset,
              },
            }
          : {}),
      },
    };
  });
  const geometry = project[VIDEO_PROJECT_ATTACHMENT_GEOMETRY];
  const exposureGeometry = geometry
    ? createExposureProject(geometry, source, center, sample, delta)
    : undefined;
  if (!changed && exposureGeometry === geometry) return project;
  const view: VideoProjectRenderScope = {
    ...project,
    clips,
    ...(project.effectInstances
      ? {
          effectInstances: project.effectInstances.map((instance) => {
            const startTime = starts.get(instance.id);
            return startTime === undefined ? instance : { ...instance, startTime };
          }),
        }
      : {}),
    ...(exposureGeometry ? { [VIDEO_PROJECT_ATTACHMENT_GEOMETRY]: exposureGeometry } : {}),
  };
  view.cursorTrack = materializeVideoProjectCursorSourceObservations(view);
  return view;
}

function preservePhysicalTransitionState(
  frame: VideoCompositionFrame,
  original: VideoProject,
  exposure: VideoProject,
  time: number
) {
  const clips = new Map(original.clips.map((clip) => [clip.id, clip]));
  const exposed = new Map(exposure.clips.map((clip) => [clip.id, clip]));
  const resolve = (layers: VideoCompositionFrame['visualLayers']) =>
    layers.map((layer) => {
      const before = clips.get(layer.clipId),
        after = exposed.get(layer.clipId);
      if (!before || !after || before === after) return layer;
      const renderState = resolveClipTransitionVisualState(original, before, time);
      const opacity =
        getClipVisualOpacity(before.playbackWindow?.fadePhase ? after : before, time) *
        renderState.opacityMultiplier;
      return { ...layer, renderState, opacity };
    });
  return {
    ...frame,
    visualLayers: resolve(frame.visualLayers),
    effectInputLayers: resolve(frame.effectInputLayers),
  };
}

export function resolveVideoCompositionRenderPasses(
  project: VideoProject,
  currentTime: number,
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    cameraViewport?: CameraOutputViewport;
  } = {}
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

  const scope: VideoProjectRenderScope = project;
  const playback = resolveMotionSourcePlayback(
    scope[VIDEO_PROJECT_ATTACHMENT_GEOMETRY] ?? project,
    currentTime
  );
  const cameraProject = playback?.geometryProject ?? project;
  const cameraTime = playback?.time ?? currentTime;
  const bounds = motionBlurSampleBounds(cameraProject, cameraTime, motionBlurAmount);
  const samples = motionBlurSamples(cameraTime, motionBlurAmount, bounds.start, bounds.end);
  const visualPasses = samples.map(({ time, alpha }) => {
    const cameraOverride = playback
      ? resolveVideoCompositionCamera({
          project: cameraProject,
          currentTime: time,
          actions: resolveVideoCompositionActions(cameraProject, time),
          cursorSample: resolveCursorSample(cameraProject, time),
          ...(options.cameraViewport ? { cameraViewport: options.cameraViewport } : {}),
        })
      : undefined;
    const delta = time - cameraTime;
    const physicalTime = playback ? currentTime + delta : time;
    const exposure = playback
      ? createExposureProject(project, playback.sourceClip, currentTime, physicalTime, delta)
      : project;
    const { timelineIndex: _index, ...exposureOptions } = options;
    const pass = createVisualPass({
      alpha,
      currentTime: physicalTime,
      frameOptions:
        exposure === project ? frameOptions : resolveRenderFrameOptions(exposure, exposureOptions),
      project: exposure,
      transitionProject: project,
      ...(cameraOverride ? { cameraOverride } : {}),
    });
    if (exposure !== project)
      pass.frame = preservePhysicalTransitionState(pass.frame, project, exposure, physicalTime);
    return pass;
  });

  if (!hasMeaningfulMotionBlurSpread(overlayFrame, visualPasses)) {
    return createSingleVisualPassResult({ currentTime, frameOptions, overlayFrame, project });
  }

  return { overlayFrame, visualPasses };
}
