import {
  getClipAudioGain,
  getClipCompositeAudioGain,
  getClipCompositeVisualOpacity,
  getClipFadeMultiplier,
  getClipVisualOpacity,
} from './presentation.gain.ts';
import {
  getClipTransitionMultiplier,
  getClipTransitionOverlapDurations,
} from './presentation.transitions.ts';
import {
  type VideoProjectAnnotationClip,
  type VideoProjectClip,
  type VideoProjectEffectClip,
  type VideoProjectImageClip,
  type VideoProjectShapeClip,
  type VideoProjectSubtitleClip,
  type VideoProjectTextClip,
  type VideoProjectVideoClip,
  VideoProjectClipType,
} from '../types/index';

export function isTextClip(clip: VideoProjectClip): clip is VideoProjectTextClip {
  return clip.type === VideoProjectClipType.TEXT;
}

export function isAnnotationClip(clip: VideoProjectClip): clip is VideoProjectAnnotationClip {
  return clip.type === VideoProjectClipType.ANNOTATION;
}

export function isShapeClip(clip: VideoProjectClip): clip is VideoProjectShapeClip {
  return clip.type === VideoProjectClipType.SHAPE;
}

export function isSubtitleClip(clip: VideoProjectClip): clip is VideoProjectSubtitleClip {
  return clip.type === VideoProjectClipType.SUBTITLE;
}

export function isVisualClip(
  clip: VideoProjectClip
): clip is
  | VideoProjectVideoClip
  | VideoProjectImageClip
  | VideoProjectTextClip
  | VideoProjectAnnotationClip
  | VideoProjectEffectClip
  | VideoProjectSubtitleClip
  | VideoProjectShapeClip {
  return clip.type !== VideoProjectClipType.AUDIO;
}

export {
  getClipAudioGain,
  getClipCompositeAudioGain,
  getClipCompositeVisualOpacity,
  getClipFadeMultiplier,
  getClipTransitionMultiplier,
  getClipTransitionOverlapDurations,
  getClipVisualOpacity,
};
