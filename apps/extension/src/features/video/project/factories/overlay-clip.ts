import { translate } from '../../../../platform/i18n';
import {
  DEFAULT_CLIP_FADE_MS,
  DEFAULT_CLIP_VOLUME,
  DEFAULT_SHAPE_CLIP_DURATION,
  DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE,
  DEFAULT_TEXT_CLIP_DURATION,
  DEFAULT_VIDEO_SHAPE_STYLE,
  DEFAULT_VIDEO_TEXT_STYLE,
} from '../defaults';
import { createAnnotationClip as createAnnotationTemplateClip } from '../annotation/template';
import type { VideoAnnotationTemplateInput } from '../annotation/template';
import { createVideoProjectTransform } from './clip';
import { resolveSubtitleTrackTransform } from '../text/subtitle-track';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoProjectClipType,
  type VideoProjectTransform,
  type VideoProjectEffectClip,
  type VideoProjectShapeClip,
  VideoProjectShapeType,
  type VideoProjectSubtitleClip,
  type VideoProjectTextClip,
} from '../types/index';

export function createEffectHostClip(args: {
  duration: number;
  effectInstanceId: string;
  name: string;
  projectHeight: number;
  projectWidth: number;
  startTime: number;
  trackId: string;
}): VideoProjectEffectClip {
  const width = Math.max(1, Math.round(args.projectWidth * 0.48));
  const height = Math.max(1, Math.round((width * args.projectHeight) / args.projectWidth));
  return {
    id: crypto.randomUUID(),
    trackId: args.trackId,
    type: VideoProjectClipType.EFFECT,
    effectInstanceId: args.effectInstanceId,
    name: args.name,
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: args.startTime,
    duration: args.duration,
    muted: true,
    volume: DEFAULT_CLIP_VOLUME,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: DEFAULT_CLIP_FADE_MS,
    fadeOutMs: DEFAULT_CLIP_FADE_MS,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: createVideoProjectTransform(
      width,
      height,
      Math.round((args.projectWidth - width) / 2),
      Math.round((args.projectHeight - height) / 2)
    ),
  };
}

export function createTextClip(
  trackId: string,
  projectWidth: number,
  projectHeight: number,
  startTime: number
): VideoProjectTextClip {
  return {
    id: crypto.randomUUID(),
    trackId,
    type: VideoProjectClipType.TEXT,
    name: translate('shared.videoProject.defaultTextClipName'),
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime,
    duration: DEFAULT_TEXT_CLIP_DURATION,
    muted: true,
    volume: DEFAULT_CLIP_VOLUME,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: DEFAULT_CLIP_FADE_MS,
    fadeOutMs: DEFAULT_CLIP_FADE_MS,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: createVideoProjectTransform(
      Math.round(projectWidth * 0.48),
      Math.round(projectHeight * 0.2),
      Math.round(projectWidth * 0.08),
      Math.round(projectHeight * 0.1)
    ),
    text: translate('shared.videoProject.defaultTextClipContent'),
    style: { ...DEFAULT_VIDEO_TEXT_STYLE },
  };
}

export function createAnnotationClip(
  trackId: string,
  projectWidth: number,
  projectHeight: number,
  startTime: number,
  templateInput?: VideoAnnotationTemplateInput
) {
  return createAnnotationTemplateClip(
    trackId,
    projectWidth,
    projectHeight,
    startTime,
    templateInput
  );
}

export function createShapeClip(
  trackId: string,
  projectWidth: number,
  projectHeight: number,
  startTime: number,
  shapeType: VideoProjectShapeType
): VideoProjectShapeClip {
  return {
    id: crypto.randomUUID(),
    trackId,
    type: VideoProjectClipType.SHAPE,
    name: resolveShapeClipName(shapeType),
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime,
    duration: DEFAULT_SHAPE_CLIP_DURATION,
    muted: true,
    volume: DEFAULT_CLIP_VOLUME,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: DEFAULT_CLIP_FADE_MS,
    fadeOutMs: DEFAULT_CLIP_FADE_MS,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: createDefaultShapeTransform(projectWidth, projectHeight, shapeType),
    shapeType,
    style: { ...DEFAULT_VIDEO_SHAPE_STYLE },
  };
}

function resolveShapeClipName(shapeType: VideoProjectShapeType): string {
  switch (shapeType) {
    case VideoProjectShapeType.ELLIPSE:
      return translate('shared.videoProject.defaultEllipseClipName');
    case VideoProjectShapeType.LINE:
      return translate('shared.videoProject.defaultLineClipName');
    case VideoProjectShapeType.ARROW:
      return translate('shared.videoProject.defaultArrowClipName');
    case VideoProjectShapeType.RECTANGLE:
      return translate('shared.videoProject.defaultRectangleClipName');
  }
}

function createDefaultShapeTransform(
  projectWidth: number,
  projectHeight: number,
  shapeType: VideoProjectShapeType
): VideoProjectTransform {
  if (isConnectorShapeType(shapeType)) {
    return createVideoProjectTransform(
      Math.round(projectWidth * 0.28),
      DEFAULT_VIDEO_SHAPE_STYLE.strokeWidth,
      Math.round(projectWidth * 0.36),
      Math.round(projectHeight * 0.24)
    );
  }

  return createVideoProjectTransform(
    Math.round(projectWidth * 0.28),
    Math.round(projectHeight * 0.22),
    Math.round(projectWidth * 0.62),
    Math.round(projectHeight * 0.12)
  );
}

function isConnectorShapeType(shapeType: VideoProjectShapeType) {
  return shapeType === VideoProjectShapeType.LINE || shapeType === VideoProjectShapeType.ARROW;
}

export function createSubtitleClip(
  trackId: string,
  projectWidth: number,
  projectHeight: number,
  startTime: number
): VideoProjectSubtitleClip {
  return {
    id: crypto.randomUUID(),
    trackId,
    type: VideoProjectClipType.SUBTITLE,
    name: translate('shared.videoProject.defaultSubtitleClipName'),
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime,
    duration: DEFAULT_TEXT_CLIP_DURATION,
    muted: true,
    volume: DEFAULT_CLIP_VOLUME,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: DEFAULT_CLIP_FADE_MS,
    fadeOutMs: DEFAULT_CLIP_FADE_MS,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: resolveSubtitleTrackTransform(
      { height: projectHeight, width: projectWidth },
      DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE
    ),
    text: translate('shared.videoProject.defaultSubtitleClipContent'),
  };
}
