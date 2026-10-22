import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../../../project/types/export';
import type { VideoProjectRenderScope } from '../../../project/export/render-scope';
import { resolveVideoCompositionSpotlights } from './spotlights';
import { resolveEffectSourceClip } from '../../../project/effect-instance/placement';
import { resolveCursorSourcePointMapping } from './cursor';
import { resolveVideoCompositionBorders } from './borders';
import type { VideoCompositionBorderState, VideoCompositionSpotlightState } from '../../types';
import { hasCameraMediaAt, resolveCameraVisualClip } from '../../../project/camera/animation';
import { resolveVideoCompositionActions } from './actions';
import {
  getClipCompositeVisualOpacity,
  isClipActiveAtTime,
  isSubtitleClip,
  isVisualClip,
} from '../../../project/timeline';
import { resolveClipTransitionVisualState } from '../../../project/transition/presentation';
import {
  resolveSubtitleTrackTransform,
  resolveSubtitleClipStyle,
  resolveTextualClipStyle,
} from '../../../project/text/subtitle-track';
import { VideoProjectTrackRole, type VideoProjectClip } from '../../../project/types/index';
import type { EffectRuntimeFramePlan } from '../../effect-runtime/runtime/types';
import type { VideoCompositionVisualLayer, VideoCompositionActionState } from '../../types';
import { createAnnotationVisualLayer } from './annotation-layer';
import {
  createVideoCompositionTimelineIndex,
  type VideoCompositionTimelineIndex,
} from './composition-index';

function createBaseVisualLayer(
  clip: Extract<VideoProjectClip, { transform: VideoProjectClip['transform'] }>,
  project: VideoProjectRenderScope,
  currentTime: number,
  opacity: number,
  zIndex: number
) {
  const transform = isSubtitleClip(clip)
    ? resolveSubtitleTrackTransform(project, resolveSubtitleClipStyle(project, clip))
    : clip.transform;

  return {
    clip,
    clipId: clip.id,
    height: transform.height,
    opacity,
    renderState: resolveClipTransitionVisualState(project, clip, currentTime),
    rotation: transform.rotation,
    width: transform.width,
    x: transform.x,
    y: transform.y,
    zIndex,
  };
}

function createVisualLayer(
  clip: VideoProjectClip,
  currentTime: number,
  project: VideoProjectRenderScope,
  zIndex: number,
  options: {
    includeSubtitles: boolean;
    includeTransparent: boolean;
    actions: readonly VideoCompositionActionState[];
    windowBorders: ReadonlyMap<string, readonly VideoCompositionBorderState[]>;
    windowSpotlights: ReadonlyMap<string, readonly VideoCompositionSpotlightState[]>;
  }
): VideoCompositionVisualLayer | null {
  if (!hasCameraMediaAt(project, clip, currentTime)) return null;
  clip = resolveCameraVisualClip(project, clip, currentTime);
  if (!isVisualClip(clip)) {
    return null;
  }

  if (isSubtitleClip(clip) && !options.includeSubtitles) {
    return null;
  }

  const opacity = getClipCompositeVisualOpacity(project, clip, currentTime);
  if (opacity <= 0 && !options.includeTransparent) {
    return null;
  }

  const resolvedBaseLayer = createBaseVisualLayer(clip, project, currentTime, opacity, zIndex);

  switch (clip.type) {
    case 'VIDEO':
      return {
        ...resolvedBaseLayer,
        clip,
        kind: 'video',
        ...(options.windowBorders.get(clip.id)?.length
          ? { borders: options.windowBorders.get(clip.id)! }
          : {}),
        ...(options.windowSpotlights.get(clip.id)?.length
          ? { spotlights: options.windowSpotlights.get(clip.id)! }
          : {}),
        actions: options.actions.filter((action) => action.clipId === clip.id),
        ...(project.tracks.find((track) => track.id === clip.trackId)?.role ===
        VideoProjectTrackRole.CAMERA
          ? { trackRole: VideoProjectTrackRole.CAMERA }
          : {}),
      };
    case 'IMAGE':
      return { ...resolvedBaseLayer, clip, kind: 'image' };
    case 'TEXT':
    case 'SUBTITLE':
      return createTextVisualLayer(clip, project, resolvedBaseLayer);
    case 'ANNOTATION':
      return createAnnotationVisualLayer(clip, currentTime, project, zIndex);
    case 'EFFECT': {
      if (clip.attachment?.kind !== 'source') return { ...resolvedBaseLayer, clip, kind: 'effect' };
      const geometryProject = project[VIDEO_PROJECT_ATTACHMENT_GEOMETRY] ?? project;
      const source = resolveEffectSourceClip(geometryProject, clip, currentTime);
      const mapping =
        source && resolveCursorSourcePointMapping(geometryProject, source.id, currentTime);
      const owner =
        source && createVisualLayer(source, currentTime, geometryProject, zIndex, options);
      if (!mapping || owner?.kind !== 'video') return null;
      return {
        ...resolvedBaseLayer,
        clip,
        kind: 'effect',
        sourceAttachment: { owner, mapping },
      };
    }
    case 'SHAPE':
      return { ...resolvedBaseLayer, clip, kind: 'shape' };
  }
}

function createTextVisualLayer(
  clip: Extract<VideoProjectClip, { type: 'TEXT' | 'SUBTITLE' }>,
  project: VideoProjectRenderScope,
  baseLayer: ReturnType<typeof createBaseVisualLayer>
): VideoCompositionVisualLayer {
  return {
    ...baseLayer,
    clip: {
      id: clip.id,
      style: resolveTextualClipStyle(project, clip),
      text: clip.text,
      trackId: clip.trackId,
      type: clip.type,
    },
    kind: 'text',
  };
}

export function resolveVideoCompositionVisualLayers(
  project: VideoProjectRenderScope,
  currentTime: number,
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    actions?: readonly VideoCompositionActionState[];
    windowBorders?: ReadonlyMap<string, readonly VideoCompositionBorderState[]>;
    windowSpotlights?: ReadonlyMap<string, readonly VideoCompositionSpotlightState[]>;
  } = {}
): VideoCompositionVisualLayer[] {
  const resolvedOptions = {
    includeSubtitles: options.includeSubtitles ?? true,
    includeTransparent: false,
    windowBorders:
      options.windowBorders ?? resolveVideoCompositionBorders(project, currentTime).windows,
    windowSpotlights:
      options.windowSpotlights ?? resolveVideoCompositionSpotlights(project, currentTime).windows,
    actions: options.actions ?? resolveVideoCompositionActions(project, currentTime),
  };
  const timelineIndex = options.timelineIndex ?? createVideoCompositionTimelineIndex(project);
  const visualLayers: VideoCompositionVisualLayer[] = [];
  let zIndex = 0;

  for (const track of timelineIndex.tracksInRenderOrder) {
    if (!track.visible) {
      continue;
    }

    for (const clip of timelineIndex.clipsByTrackId.get(track.id) ?? []) {
      if (!isClipActiveAtTime(clip, currentTime)) {
        continue;
      }

      const layer = createVisualLayer(clip, currentTime, project, zIndex, resolvedOptions);
      if (layer) {
        visualLayers.push(layer);
        zIndex += 1;
      }
    }
  }

  return visualLayers;
}

export function resolveVideoCompositionEffectInputLayers(
  project: VideoProjectRenderScope,
  currentTime: number,
  plans: readonly EffectRuntimeFramePlan[],
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    actions?: readonly VideoCompositionActionState[];
    windowBorders?: ReadonlyMap<string, readonly VideoCompositionBorderState[]>;
    windowSpotlights?: ReadonlyMap<string, readonly VideoCompositionSpotlightState[]>;
  } = {}
): VideoCompositionVisualLayer[] {
  const requestedClipIds = collectEffectInputClipIds(plans);
  if (requestedClipIds.size === 0) return [];
  const timelineIndex = options.timelineIndex ?? createVideoCompositionTimelineIndex(project);
  const layers: VideoCompositionVisualLayer[] = [];
  const actions = options.actions ?? resolveVideoCompositionActions(project, currentTime);
  const windowBorders =
    options.windowBorders ?? resolveVideoCompositionBorders(project, currentTime).windows;
  const windowSpotlights =
    options.windowSpotlights ?? resolveVideoCompositionSpotlights(project, currentTime).windows;
  let zIndex = 0;
  for (const track of timelineIndex.tracksInRenderOrder) {
    if (!track.visible) continue;
    for (const clip of timelineIndex.clipsByTrackId.get(track.id) ?? []) {
      if (!requestedClipIds.has(clip.id) || !isClipActiveAtTime(clip, currentTime)) continue;
      const layer = createVisualLayer(clip, currentTime, project, zIndex, {
        includeSubtitles: options.includeSubtitles ?? true,
        includeTransparent: true,
        actions,
        windowBorders,
        windowSpotlights,
      });
      if (layer) layers.push(layer);
      zIndex += 1;
    }
  }
  return layers;
}

function collectEffectInputClipIds(plans: readonly EffectRuntimeFramePlan[]): Set<string> {
  const clipIds = new Set<string>();
  for (const plan of plans) {
    if (plan.target.kind === 'clip') clipIds.add(plan.target.clipId);
    if (plan.target.kind === 'track' || plan.target.kind === 'video-group') {
      for (const id of plan.target.clipIds) clipIds.add(id);
    }
    if (plan.target.kind === 'transition') {
      clipIds.add(plan.target.leadingClipId);
      clipIds.add(plan.target.trailingClipId);
    }
  }
  return clipIds;
}
