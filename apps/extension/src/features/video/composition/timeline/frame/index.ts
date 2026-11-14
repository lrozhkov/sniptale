import {
  buildGlTrackPlan,
  type GlTrackJunction,
  type GlTrackNode,
} from '../../../project/transition/gl-track-plan';
import { buildProjectTransitionSegments } from '../../../project/transition/project';
import { getTransitionProgress } from '../../../project/transition/runtime';
import { GPU_PREVIEW_LIMITS } from '../../canvas/gpu-preview-plan';
import { EffectRuntimeResourceError } from '../../effect-runtime/runtime/resource-limits';
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
  const visualLayers = contentLayers(
    resolveVideoCompositionVisualLayers(project, currentTime, layerOptions)
  );
  const glTrackPlans = resolveTrackPlans(project, currentTime, visualLayers, timelineIndex);
  const sourceCursors = new Map<string, NonNullable<VideoCompositionFrame['cursor']>>();
  for (const layer of visualLayers) {
    if (layer.kind !== 'video' || !glTrackPlans.has(layer.clip.trackId)) continue;
    const scoped = resolveVideoCompositionCursor(project, currentTime, actions, layer.clipId);
    if (scoped)
      sourceCursors.set(
        layer.clipId,
        sourceContentTransform && layer.clipId === camera.sourceClipId
          ? {
              ...scoped,
              ...mapCompositionPointThroughSourceContent(project, camera, currentTime, scoped),
              scale:
                scoped.scale * Math.hypot(sourceContentTransform[0], sourceContentTransform[3]),
            }
          : scoped
      );
  }
  const liftedCursor =
    cursorSample?.sourceAnchor &&
    visualLayers.some(
      (layer) =>
        layer.clipId === cursorSample.sourceAnchor?.sourceClipId &&
        glTrackPlans.has(layer.clip.trackId)
    );
  return {
    ...(glTrackPlans.size ? { glTrackPlans } : {}),
    ...(sourceCursors.size ? { sourceCursors } : {}),
    ...(spotlights.scene.length ? { sceneSpotlights: spotlights.scene } : {}),
    ...(borders.viewport.length ? { viewportBorders: borders.viewport } : {}),
    actions: actions.filter((action) => action.clipId === null),
    camera,
    cursor: liftedCursor
      ? null
      : cursor &&
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
    visualLayers,
  };
}

function resolveTrackPlans(
  project: VideoProjectRenderScope,
  time: number,
  layers: VideoCompositionFrame['visualLayers'],
  index: VideoCompositionTimelineIndex
): ReadonlyMap<string, GlTrackNode> {
  const byTrack = new Map<string, GlTrackJunction[]>();
  for (const segment of buildProjectTransitionSegments(project)) {
    if (segment.transition.kind !== 'gl') continue;
    const progress = getTransitionProgress(segment, time);
    if (
      progress === null ||
      !project.tracks.some((track) => track.id === segment.leadingClip.trackId && track.visible)
    )
      continue;
    const trackId = segment.leadingClip.trackId;
    const edges = byTrack.get(trackId) ?? [];
    edges.push({
      id: segment.id,
      leadingClipId: segment.leadingClipId,
      trailingClipId: segment.trailingClipId,
      start: segment.start,
      progress,
      selection: segment.transition.selection,
    });
    byTrack.set(trackId, edges);
  }
  const plans = new Map<string, GlTrackNode>();
  for (const [trackId, edges] of byTrack) {
    const members = new Set(
      layers.filter((layer) => layer.clip.trackId === trackId).map((layer) => layer.clipId)
    );
    for (const edge of edges) {
      members.add(edge.leadingClipId);
      members.add(edge.trailingClipId);
    }
    const clips = (index.clipsByTrackId.get(trackId) ?? []).filter((clip) => members.has(clip.id));
    const result = buildGlTrackPlan(
      clips.map((clip) => clip.id),
      edges,
      GPU_PREVIEW_LIMITS
    );
    if (!result.ok) {
      if (result.reason === 'resources') throw new EffectRuntimeResourceError();
      throw new Error('Invalid project transition composition.');
    }
    plans.set(trackId, result.root);
  }
  return plans;
}
