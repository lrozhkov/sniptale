import { mapCompositionPointThroughSourceContent } from '../../motion/source-window';
import { projectMotionSourcePhases } from '../../../project/motion/source-binding';
import { resolveVideoCompositionSpotlights } from './spotlights';
import { resolveVideoCompositionBorders } from './borders';
import type { CameraOutputViewport } from '../../../project/export/output-dimensions';
import type { VideoProject } from '../../../project/types/index';
import { resolveVideoCompositionCamera } from '../../motion/index';
import { resolveEffectRuntimeFramePlans } from '../../effect-runtime/frame/plan';
import type { VideoCompositionFrame } from '../../types';
import { resolveVideoCompositionActions } from './actions';
import { resolveCursorSample, resolveVideoCompositionCursor } from './cursor';
import {
  resolveVideoCompositionEffectInputLayers,
  resolveVideoCompositionVisualLayers,
} from './layers';
import {
  createVideoCompositionTimelineIndex,
  type VideoCompositionTimelineIndex,
} from './composition-index';

export { resolveVideoCompositionActions } from './actions';
export { createVideoCompositionTimelineIndex } from './composition-index';
export type { VideoCompositionTimelineIndex } from './composition-index';
export { resolveVideoCompositionCursor } from './cursor';

export function resolveVideoCompositionFrame(
  project: VideoProject,
  currentTime: number,
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    cameraViewport?: CameraOutputViewport;
  } = {}
): VideoCompositionFrame {
  project = projectMotionSourcePhases(project);
  const timelineIndex = options.timelineIndex ?? createVideoCompositionTimelineIndex(project);
  const actions = resolveVideoCompositionActions(project, currentTime);
  const cursorSample = resolveCursorSample(project, currentTime);
  const effectRuntimePlans = resolveEffectRuntimeFramePlans(project, currentTime);
  const borders = resolveVideoCompositionBorders(project, currentTime);
  const spotlights = resolveVideoCompositionSpotlights(project, currentTime);
  const layerOptions = {
    ...options,
    timelineIndex,
    actions,
    windowBorders: borders.windows,
    windowSpotlights: spotlights.windows,
  };

  const camera = resolveVideoCompositionCamera({
    actions,
    cursorSample,
    currentTime,
    project,
    ...(options.cameraViewport ? { cameraViewport: options.cameraViewport } : {}),
  });
  const cursor = resolveVideoCompositionCursor(project, currentTime, actions);
  const sourceContentTransform = camera.sourceContentTransform;
  const contentLayers = (layers: VideoCompositionFrame['visualLayers']) =>
    sourceContentTransform
      ? layers.map((layer) =>
          layer.kind === 'video' && layer.clipId === camera.sourceClipId
            ? { ...layer, sourceContentTransform }
            : layer
        )
      : layers;
  return {
    ...(spotlights.scene.length ? { sceneSpotlights: spotlights.scene } : {}),
    ...(borders.viewport.length ? { viewportBorders: borders.viewport } : {}),
    actions: actions.filter((action) => action.clipId === null),
    camera,
    cursor:
      cursor &&
      sourceContentTransform &&
      (!cursorSample?.sourceAnchor ||
        cursorSample.sourceAnchor.sourceClipId === camera.sourceClipId)
        ? {
            ...cursor,
            ...mapCompositionPointThroughSourceContent(project, camera, currentTime, cursor),
            scale: cursor.scale * Math.hypot(sourceContentTransform[0], sourceContentTransform[3]),
          }
        : cursor,
    effectInputLayers: contentLayers(
      resolveVideoCompositionEffectInputLayers(
        project,
        currentTime,
        effectRuntimePlans,
        layerOptions
      )
    ),
    effectRuntimePlans,
    visualLayers: contentLayers(
      resolveVideoCompositionVisualLayers(project, currentTime, layerOptions)
    ),
  };
}
