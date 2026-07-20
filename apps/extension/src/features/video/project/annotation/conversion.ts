import type {
  VideoProject,
  VideoProjectAnnotationClip,
  VideoProjectTextClip,
} from '../types/index';
import { createAnnotationClip } from './template';

type AnnotationTemplateKind = VideoProjectAnnotationClip['templateKind'];

export function convertTextClipToAnnotationClip(
  project: Pick<VideoProject, 'height' | 'width'>,
  clip: VideoProjectTextClip,
  templateKind: AnnotationTemplateKind
): VideoProjectAnnotationClip {
  const annotationClip = createAnnotationClip(
    clip.trackId,
    project.width,
    project.height,
    clip.startTime,
    templateKind
  );
  const content = resolveConvertedContent(clip.text, annotationClip.content);

  return {
    ...annotationClip,
    id: clip.id,
    name: clip.name,
    groupId: clip.groupId,
    linkMode: clip.linkMode,
    duration: clip.duration,
    muted: clip.muted,
    volume: clip.volume,
    fadeInMs: clip.fadeInMs,
    fadeOutMs: clip.fadeOutMs,
    transitionIn: clip.transitionIn,
    transitionOut: clip.transitionOut,
    transform: clip.transform,
    ...resolveOptionalAudioState(clip),
    content,
    style: {
      ...annotationClip.style,
      accentColor: resolveAccentColor(clip, annotationClip.style.accentColor),
      backgroundColor: resolveMappedColor(
        clip.style.backgroundColor,
        annotationClip.style.backgroundColor
      ),
      borderRadius: resolveMappedLength(clip.style.borderRadius, annotationClip.style.borderRadius),
      headlineColor: resolveMappedColor(clip.style.color, annotationClip.style.headlineColor),
      padding: resolveMappedLength(clip.style.padding, annotationClip.style.padding),
    },
  };
}

function resolveOptionalAudioState(clip: VideoProjectTextClip) {
  return {
    ...(clip.audioGainStart === undefined ? {} : { audioGainStart: clip.audioGainStart }),
    ...(clip.audioGainEnd === undefined ? {} : { audioGainEnd: clip.audioGainEnd }),
    ...(clip.volumeEnvelopeStart === undefined
      ? {}
      : { volumeEnvelopeStart: clip.volumeEnvelopeStart }),
    ...(clip.volumeEnvelopeEnd === undefined ? {} : { volumeEnvelopeEnd: clip.volumeEnvelopeEnd }),
  };
}

function resolveConvertedContent(
  text: string,
  fallback: VideoProjectAnnotationClip['content']
): VideoProjectAnnotationClip['content'] {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return fallback;
  }

  return {
    ...fallback,
    badge: null,
    headline: lines[0] ?? fallback.headline,
    subline: lines.slice(1).join(' '),
  };
}

function resolveAccentColor(clip: VideoProjectTextClip, fallback: string) {
  if (clip.style.borderWidth > 0) {
    return resolveMappedColor(clip.style.borderColor, fallback);
  }

  return resolveMappedColor(clip.style.backgroundColor, fallback);
}

function resolveMappedColor(value: string, fallback: string) {
  return value.trim() && value !== 'transparent' ? value : fallback;
}

function resolveMappedLength(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
