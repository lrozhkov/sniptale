import { drawCompositionVisualLayer } from '../../../features/video/composition/draw';
import { resolveCompositionAnnotationClip } from '../../../features/video/composition/annotation/resolved-clip';
import type { VideoCompositionVisualLayer } from '../../../features/video/composition/types';
import type { VideoCompositionMediaSource } from '../../../features/video/composition/draw/media-source';
import { resolveTextualClipStyle } from '../../../features/video/project/text/subtitle-track';
import { type VideoProjectTrack } from '../../../features/video/project/types/layout';
import {
  type VideoProject,
  type VideoProjectAnnotationClip,
  type VideoProjectClip,
  type VideoProjectSubtitleClip,
  type VideoProjectTextClip,
} from '../../../features/video/project/types/model';
import type { LoadedImagesMap } from './types';

const IDENTITY_RENDER_STATE = {
  blurAmount: 0,
  opacityMultiplier: 1,
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
} as const;

type BaseCompatibilityLayer = Omit<VideoCompositionVisualLayer, 'clip' | 'kind'>;

export function drawCompositionLayer(
  context: CanvasRenderingContext2D,
  layer: VideoCompositionVisualLayer,
  scaleX: number,
  scaleY: number,
  loadedImages: LoadedImagesMap,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>,
  opacityMultiplier = 1
): void {
  drawCompositionVisualLayer(
    context,
    layer,
    scaleX,
    scaleY,
    loadedImages,
    clipMediaElements,
    opacityMultiplier
  );
}

function createBaseCompatibilityLayer(clip: VideoProjectClip): BaseCompatibilityLayer {
  return {
    clipId: clip.id,
    height: clip.transform.height,
    opacity: clip.transform.opacity,
    renderState: IDENTITY_RENDER_STATE,
    rotation: clip.transform.rotation,
    width: clip.transform.width,
    x: clip.transform.x,
    y: clip.transform.y,
    zIndex: 0,
  };
}

function createCompatibilityLayer(
  clip: VideoProjectClip,
  project: VideoProject,
  currentTime: number
): VideoCompositionVisualLayer | null {
  const baseLayer = createBaseCompatibilityLayer(clip);

  switch (clip.type) {
    case 'VIDEO':
      return {
        ...baseLayer,
        clip,
        kind: 'video',
      };
    case 'IMAGE':
      return {
        ...baseLayer,
        clip,
        kind: 'image',
      };
    case 'TEXT':
      return createTextCompatibilityLayer(baseLayer, project.tracks, clip);
    case 'ANNOTATION':
      return createAnnotationCompatibilityLayer(baseLayer, project, clip, currentTime);
    case 'EFFECT':
      return {
        ...baseLayer,
        clip,
        kind: 'effect',
      };
    case 'SUBTITLE':
      return createTextCompatibilityLayer(baseLayer, project.tracks, clip);
    case 'SHAPE':
      return {
        ...baseLayer,
        clip,
        kind: 'shape',
      };
    case 'AUDIO':
      return null;
  }
}

function createAnnotationCompatibilityLayer(
  baseLayer: BaseCompatibilityLayer,
  project: VideoProject,
  clip: VideoProjectAnnotationClip,
  currentTime: number
): VideoCompositionVisualLayer {
  return {
    ...baseLayer,
    clip: resolveCompositionAnnotationClip(clip, currentTime, project),
    kind: 'annotation',
  };
}

function createTextCompatibilityLayer(
  baseLayer: BaseCompatibilityLayer,
  tracks: Pick<VideoProjectTrack, 'id' | 'kind' | 'subtitleStyle'>[],
  clip: VideoProjectTextClip | VideoProjectSubtitleClip
): VideoCompositionVisualLayer {
  return {
    ...baseLayer,
    clip: {
      id: clip.id,
      style: resolveTextualClipStyle({ tracks }, clip),
      text: clip.text,
      trackId: clip.trackId,
      type: clip.type,
    },
    kind: 'text',
  };
}

export function drawClip(
  context: CanvasRenderingContext2D,
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number,
  scaleX: number,
  scaleY: number,
  loadedImages: LoadedImagesMap,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>
): void {
  const layer = createCompatibilityLayer(clip, project, currentTime);
  if (!layer) {
    return;
  }

  drawCompositionLayer(context, layer, scaleX, scaleY, loadedImages, clipMediaElements);
}
