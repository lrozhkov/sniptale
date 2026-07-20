import type React from 'react';
import { resolveVideoMediaShadowCss } from '../../../../features/video/composition/canvas/media-shadow';
import { resolveAnnotationPresentation } from '../../../../features/video/project/annotation/template';
import { getClipCompositeVisualOpacity } from '../../../../features/video/project/timeline';
import {
  resolveSubtitleClipStyle,
  resolveSubtitleTrackTransform,
  resolveTextualClipStyle,
} from '../../../../features/video/project/text/subtitle-track';
import {
  type VideoProject,
  type VideoProjectAnnotationClip,
  type VideoProjectClip,
  type VideoProjectImageClip,
  type VideoProjectShapeClip,
  type VideoProjectSubtitleClip,
  type VideoProjectTextClip,
  type VideoProjectTransform,
  type VideoProjectVideoClip,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoProjectShapeType,
} from '../../../../features/video/project/types/index';

export function getMediaFitClass(fitMode: VideoMediaFitMode): string {
  switch (fitMode) {
    case VideoMediaFitMode.SOURCE_100:
    case VideoMediaFitMode.FIT_LONG_SIDE:
    case VideoMediaFitMode.FIT_SHORT_SIDE:
      return 'object-contain';
    case VideoMediaFitMode.CONTAIN:
      return 'object-contain';
    case VideoMediaFitMode.COVER:
      return 'object-cover';
    case VideoMediaFitMode.STRETCH:
      return 'object-fill';
  }

  return 'object-contain';
}

export function getPreviewClipCommonStyle(
  clip: VideoProjectClip,
  currentTime: number,
  project: VideoProject
): React.CSSProperties {
  const transform =
    clip.type === 'SUBTITLE'
      ? resolveSubtitleTrackTransform(project, resolveSubtitleClipStyle(project, clip))
      : clip.transform;

  return {
    position: 'absolute',
    left: `${(transform.x / project.width) * 100}%`,
    top: `${(transform.y / project.height) * 100}%`,
    width: `${(transform.width / project.width) * 100}%`,
    height: `${(transform.height / project.height) * 100}%`,
    opacity: getClipCompositeVisualOpacity(project, clip, currentTime),
    transform: `rotate(${transform.rotation}deg)`,
    transformOrigin: 'center center',
    ...resolvePreviewMediaShadowStyle(clip),
  };
}

function resolvePreviewMediaShadowStyle(
  clip: VideoProjectClip
): Pick<React.CSSProperties, 'boxShadow' | 'overflow' | 'zIndex'> {
  if (clip.type !== 'VIDEO' && clip.type !== 'IMAGE') {
    return {};
  }

  const shadowIntensity =
    (clip as VideoProjectVideoClip | VideoProjectImageClip).shadowIntensity ?? 0;
  const shadowMode = (clip as VideoProjectVideoClip | VideoProjectImageClip).shadowMode;
  const boxShadow = resolveVideoMediaShadowCss(shadowIntensity, shadowMode);
  return boxShadow ? { boxShadow, overflow: 'visible', zIndex: shadowIntensity > 0 ? 1 : 0 } : {};
}

export function getTextPreviewClipStyle(
  project: VideoProject,
  clip: VideoProjectTextClip | VideoProjectSubtitleClip,
  commonStyle: React.CSSProperties
): React.CSSProperties {
  const style = resolveTextualClipStyle(project, clip);

  return {
    ...commonStyle,
    borderRadius: `${style.borderRadius}px`,
    borderWidth: `${style.borderWidth}px`,
    borderColor: style.borderColor,
    backgroundColor: style.backgroundColor,
    color: style.color,
    padding: `${style.padding}px`,
    fontSize: `${style.fontSize}px`,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
  };
}

export function getShapePreviewClipStyle(
  clip: VideoProjectShapeClip,
  commonStyle: React.CSSProperties
): React.CSSProperties {
  if (isVideoConnectorShapeClip(clip)) {
    return {
      ...commonStyle,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderRadius: 0,
      borderWidth: 0,
      overflow: 'visible',
    };
  }

  return {
    ...commonStyle,
    borderRadius:
      clip.shapeType === VideoProjectShapeType.ELLIPSE ? '9999px' : `${clip.style.borderRadius}px`,
    borderWidth: `${clip.style.strokeWidth}px`,
    borderColor: clip.style.strokeColor,
    backgroundColor: clip.style.fillColor,
  };
}

export function isVideoConnectorShapeClip(clip: VideoProjectShapeClip): boolean {
  return (
    clip.shapeType === VideoProjectShapeType.LINE || clip.shapeType === VideoProjectShapeType.ARROW
  );
}

export function getAnnotationPreviewClipStyle(
  project: VideoProject,
  clip: VideoProjectAnnotationClip,
  currentTime: number
): React.CSSProperties {
  const presentation = resolveAnnotationPresentation(project, clip, currentTime);
  const frame = presentation.labelFrame;

  return {
    position: 'absolute',
    left: `${(frame.x / project.width) * 100}%`,
    top: `${(frame.y / project.height) * 100}%`,
    width: `${(frame.width / project.width) * 100}%`,
    height: `${(frame.height / project.height) * 100}%`,
    opacity: presentation.frame.opacity,
    transform:
      `translate(${presentation.effects.translateX}px, ${presentation.effects.translateY}px) ` +
      `scale(${presentation.effects.scaleMultiplier.toFixed(3)}) ` +
      `rotate(${presentation.frame.rotation}deg)`,
    transformOrigin: 'center center',
    filter: `blur(${presentation.effects.blurPx.toFixed(2)}px)`,
  };
}

export function resolvePreviewClipTransform(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime = 0
): VideoProjectTransform {
  if (clip.type !== VideoProjectClipType.ANNOTATION) {
    return clip.transform;
  }

  const presentation = resolveAnnotationPresentation(project, clip, currentTime);
  return {
    ...clip.transform,
    ...presentation.labelFrame,
    opacity: presentation.frame.opacity,
    rotation: presentation.frame.rotation,
  };
}
