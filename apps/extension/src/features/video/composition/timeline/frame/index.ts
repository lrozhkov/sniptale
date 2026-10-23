import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../../../project/types/export';
import type { VideoProjectRenderScope } from '../../../project/export/render-scope';
import { mapCompositionPointThroughSourceContent } from '../../motion/source-window';
import { projectMotionSourcePhases } from '../../../project/motion/source-binding';
import { resolveVideoCompositionSpotlights } from './spotlights';
import { resolveVideoCompositionBorders } from './borders';
import type { CameraOutputViewport } from '../../../project/export/output-dimensions';
import { resolveVideoCompositionCamera } from '../../motion/index';
import { resolveEffectRuntimeFramePlans } from '../../effect-runtime/frame/plan';
import type { VideoCompositionFrame, VideoCompositionCameraState } from '../../types';
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
  project: VideoProjectRenderScope,
  currentTime: number,
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    cameraViewport?: CameraOutputViewport;
    cameraOverride?: VideoCompositionCameraState;
  } = {}
): VideoCompositionFrame {
  const attachmentGeometryProject = project[VIDEO_PROJECT_ATTACHMENT_GEOMETRY];
  project = projectMotionSourcePhases(project);
  const geometryProject = attachmentGeometryProject
    ? projectMotionSourcePhases(attachmentGeometryProject)
    : project;
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

  const camera =
    options.cameraOverride ??
    resolveVideoCompositionCamera({
      actions:
        geometryProject === project
          ? actions
          : resolveVideoCompositionActions(geometryProject, currentTime),
      cursorSample:
        geometryProject === project
          ? cursorSample
          : resolveCursorSample(geometryProject, currentTime),
      currentTime,
      project: geometryProject,
      ...(options.cameraViewport ? { cameraViewport: options.cameraViewport } : {}),
    });
  const cursor = resolveVideoCompositionCursor(project, currentTime, actions);
  const sourceContentTransform = camera.sourceContentTransform;
  const contentLayers = (layers: VideoCompositionFrame['visualLayers']) =>
    sourceContentTransform
      ? layers.map((layer) =>
          layer.kind === 'video' && layer.clipId === camera.sourceClipId
            ? { ...layer, sourceContentTransform }
            : layer.kind === 'effect' &&
                layer.sourceAttachment &&
                layer.sourceAttachment.owner.clipId === camera.sourceClipId
              ? {
                  ...layer,
                  sourceAttachment: {
                    ...layer.sourceAttachment,
                    innerTransform: sourceContentTransform,
                  },
                }
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
