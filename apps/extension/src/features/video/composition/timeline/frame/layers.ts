import { resolveCameraVisualClip } from '../../../project/camera/animation';
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
import {
  VideoProjectTrackRole,
  type VideoProject,
  type VideoProjectClip,
} from '../../../project/types/index';
import type { EffectRuntimeFramePlan } from '../../effect-runtime/runtime/types';
import type { VideoCompositionVisualLayer, VideoCompositionActionState } from '../../types';
import { createAnnotationVisualLayer } from './annotation-layer';
import {
  createVideoCompositionTimelineIndex,
  type VideoCompositionTimelineIndex,
} from './composition-index';

function createBaseVisualLayer(
  clip: Extract<VideoProjectClip, { transform: VideoProjectClip['transform'] }>,
  project: VideoProject,
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
  project: VideoProject,
  zIndex: number,
  options: {
    includeSubtitles: boolean;
    includeTransparent: boolean;
    actions: readonly VideoCompositionActionState[];
  }
): VideoCompositionVisualLayer | null {
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
    case 'EFFECT':
      return { ...resolvedBaseLayer, clip, kind: 'effect' };
    case 'SHAPE':
      return { ...resolvedBaseLayer, clip, kind: 'shape' };
  }
}

function createTextVisualLayer(
  clip: Extract<VideoProjectClip, { type: 'TEXT' | 'SUBTITLE' }>,
  project: VideoProject,
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
  project: VideoProject,
  currentTime: number,
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    actions?: readonly VideoCompositionActionState[];
  } = {}
): VideoCompositionVisualLayer[] {
  const resolvedOptions = {
    includeSubtitles: options.includeSubtitles ?? true,
    includeTransparent: false,
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
  project: VideoProject,
  currentTime: number,
  plans: readonly EffectRuntimeFramePlan[],
  options: {
    includeSubtitles?: boolean;
    timelineIndex?: VideoCompositionTimelineIndex;
    actions?: readonly VideoCompositionActionState[];
  } = {}
): VideoCompositionVisualLayer[] {
  const requestedClipIds = collectEffectInputClipIds(plans);
  if (requestedClipIds.size === 0) return [];
  const timelineIndex = options.timelineIndex ?? createVideoCompositionTimelineIndex(project);
  const layers: VideoCompositionVisualLayer[] = [];
  const actions = options.actions ?? resolveVideoCompositionActions(project, currentTime);
  let zIndex = 0;
  for (const track of timelineIndex.tracksInRenderOrder) {
    if (!track.visible) continue;
    for (const clip of timelineIndex.clipsByTrackId.get(track.id) ?? []) {
      if (!requestedClipIds.has(clip.id) || !isClipActiveAtTime(clip, currentTime)) continue;
      const layer = createVisualLayer(clip, currentTime, project, zIndex, {
        includeSubtitles: options.includeSubtitles ?? true,
        includeTransparent: true,
        actions,
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
    if (plan.target.kind === 'transition') {
      clipIds.add(plan.target.leadingClipId);
      clipIds.add(plan.target.trailingClipId);
    }
  }
  return clipIds;
}
