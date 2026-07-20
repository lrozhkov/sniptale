import type React from 'react';
import type {
  VideoProjectClip,
  VideoProjectImageClip,
  VideoProjectShapeClip,
  VideoProjectSubtitleClip,
  VideoProjectTextClip,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';
import type { PreviewStageInteractionHandler, PreviewStageVideoRefs } from '../types';

export interface MediaPreviewRendererParams {
  assetUrls: Record<string, string>;
  clip: VideoProjectClip;
  commonStyle: React.CSSProperties;
  onBeginInteraction: PreviewStageInteractionHandler;
  selectedClipId: string | null;
  videoRefs: PreviewStageVideoRefs;
}

export interface VideoPreviewClipParams {
  clip: VideoProjectVideoClip;
  src: string | undefined;
  commonStyle: React.CSSProperties;
  onBeginInteraction: PreviewStageInteractionHandler;
  selectedClipId: string | null;
  videoRefs: PreviewStageVideoRefs;
}

export interface ImagePreviewClipParams {
  clip: VideoProjectImageClip;
  src: string | undefined;
  commonStyle: React.CSSProperties;
  onBeginInteraction: PreviewStageInteractionHandler;
  selectedClipId: string | null;
}

export interface TextPreviewClipParams {
  clip: VideoProjectTextClip | VideoProjectSubtitleClip;
  commonStyle: React.CSSProperties;
  onBeginInteraction: PreviewStageInteractionHandler;
  selectedClipId: string | null;
}

export interface ShapePreviewClipParams {
  clip: VideoProjectShapeClip;
  commonStyle: React.CSSProperties;
  onBeginInteraction: PreviewStageInteractionHandler;
  selectedClipId: string | null;
}

export function getPreviewClipFrameClassName(
  selectedClipId: string | null,
  clipId: string
): string {
  const selectedClassName = [
    'border-[color:var(--sniptale-color-border-accent-strong)]',
    'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
  ].join(' ');

  return [
    'overflow-hidden rounded-[14px] border',
    selectedClipId === clipId
      ? selectedClassName
      : 'border-[color:var(--sniptale-color-border-subtle)]',
  ].join(' ');
}
