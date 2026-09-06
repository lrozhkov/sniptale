import type React from 'react';
import { getClipWaveformPeaks, isAudioClip } from '../../../../features/video/project/timeline';
import { getClipGainRange } from '../../../../features/video/project/timeline/basics';
import { getTrackJunctions } from '../../../../features/video/project/transition/junctions';
import type { ProjectTimelineClipProps, ProjectTimelineClipViewModel } from './types';

const DEFAULT_CLIP_ROW_HEIGHT = 62;
const MIN_CLIP_HEIGHT = 22;
const CLIP_VERTICAL_PADDING = 18;
const LABEL_BASE_INSET = 12;
const MIN_PREVIEW_TILE_WIDTH = 1;
const MAX_PREVIEW_TILE_WIDTH = 160;
const SELECTED_CLIP_SHADOW_CLASS_NAME = [
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_28%,transparent),',
  '0_2px_8px_color-mix(in_srgb,var(--sniptale-color-text-primary)_8%,transparent)]',
].join('');
const TRIM_HANDLE_CLASS_NAME = [
  'absolute inset-y-0 z-30 w-[min(10px,25%)] !cursor-ew-resize',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_20%,transparent)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_32%,transparent)]',
].join(' ');

export function buildProjectTimelineClipViewModel({
  clip,
  isHovered,
  isSelected,
  pixelsPerSecond,
  project,
  trackClipTop = 0,
  trackClipRowHeight = DEFAULT_CLIP_ROW_HEIGHT,
  trackLocked,
}: Pick<
  ProjectTimelineClipProps,
  | 'clip'
  | 'isHovered'
  | 'isSelected'
  | 'pixelsPerSecond'
  | 'project'
  | 'trackClipTop'
  | 'trackClipRowHeight'
  | 'trackLocked'
>): ProjectTimelineClipViewModel {
  const width = Math.max(1, clip.duration * pixelsPerSecond);
  const transitionViewModel = getTimelineClipTransitionViewModel({
    clip,
    pixelsPerSecond,
    project,
    width,
  });
  const gainRange = getClipGainRange(clip);
  const visualEmphasis = isHovered || isSelected;
  const waveformPeaks = getTimelineClipWaveformPeaks({ clip, project, width });

  return {
    clipClassName: getTimelineClipClassName({ isSelected, isHovered, trackLocked }),
    edgeClassName: getTimelineClipEdgeClassName(visualEmphasis),
    fadeInOverlayWidth: getFadeOverlayWidth(clip.fadeInMs, clip.duration, width),
    fadeOutOverlayWidth: getFadeOverlayWidth(clip.fadeOutMs, clip.duration, width),
    left: clip.startTime * pixelsPerSecond,
    previewTileWidth: getPreviewTileWidth(trackClipRowHeight),
    style: {
      ...getTimelineClipStyle(trackClipRowHeight, trackClipTop ?? 0),
      clipPath: `inset(0 ${transitionViewModel.bodyInsetRight}px 0 ${transitionViewModel.bodyInsetLeft}px)`,
    },
    ...transitionViewModel,
    trimHandleClassName: TRIM_HANDLE_CLASS_NAME,
    waveformPeaks,
    waveformEnvelopeEnd: gainRange.end,
    waveformEnvelopeStart: gainRange.start,
    width,
    visualEmphasis,
  };
}

function getTimelineClipTransitionViewModel({
  clip,
  pixelsPerSecond,
  project,
  width,
}: Pick<ProjectTimelineClipProps, 'clip' | 'pixelsPerSecond' | 'project'> &
  Pick<ProjectTimelineClipViewModel, 'width'>) {
  let bodyInsetLeft = 0;
  let bodyInsetRight = 0;
  for (const junction of getTrackJunctions(project)) {
    const halfOverlap = Math.min(width, junction.duration * pixelsPerSecond) / 2;
    if (junction.trailingClip.id === clip.id) bodyInsetLeft = halfOverlap;
    if (junction.leadingClip.id === clip.id) bodyInsetRight = halfOverlap;
  }
  return {
    bodyInsetLeft,
    bodyInsetRight,
    labelStyle: {
      left: LABEL_BASE_INSET + bodyInsetLeft,
      right: LABEL_BASE_INSET + bodyInsetRight,
    },
  };
}

function getTimelineClipClassName({
  isHovered,
  isSelected,
  trackLocked,
}: Pick<ProjectTimelineClipProps, 'isHovered' | 'isSelected' | 'trackLocked'>): string {
  const visualEmphasis = isHovered || isSelected;

  return [
    'pointer-events-auto absolute flex items-center overflow-hidden rounded-sm',
    'outline outline-1 -outline-offset-1',
    'outline-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_24%,transparent)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]',
    'text-xs text-[var(--sniptale-color-text-primary-strong)]',
    'shadow-[0_1px_3px_color-mix(in_srgb,var(--sniptale-color-text-primary)_8%,transparent)]',
    'transition-[border-color,box-shadow,filter]',
    visualEmphasis
      ? [
          'ring-2 ring-[color:color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_74%,transparent)]',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_66%,transparent)]',
          SELECTED_CLIP_SHADOW_CLASS_NAME,
          'brightness-110',
        ].join(' ')
      : '',
    trackLocked ? 'opacity-55 cursor-default' : 'cursor-grab',
  ].join(' ');
}

function getTimelineClipEdgeClassName(visualEmphasis: boolean): string {
  return [
    'pointer-events-none absolute inset-y-1 z-20 w-px rounded-full',
    visualEmphasis
      ? 'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_92%,transparent)]'
      : 'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_34%,transparent)] opacity-0',
  ].join(' ');
}

function getFadeOverlayWidth(fadeMs: number, durationSeconds: number, width: number): number {
  if (fadeMs <= 0 || durationSeconds <= 0) {
    return 0;
  }

  const fadeSeconds = fadeMs / 1000;
  return Math.min(width / 2, Math.max(0, fadeSeconds * (width / durationSeconds)));
}

function getTimelineClipStyle(
  trackClipRowHeight: number,
  trackClipTop: number
): React.CSSProperties {
  const clipHeight = Math.max(MIN_CLIP_HEIGHT, trackClipRowHeight - CLIP_VERTICAL_PADDING);
  return {
    height: clipHeight,
    top: trackClipTop + Math.max(4, (trackClipRowHeight - clipHeight) / 2),
  };
}

function getTimelineClipWaveformPeaks({
  clip,
  project,
  width,
}: Pick<ProjectTimelineClipProps, 'clip' | 'project'> & { width: number }): number[] {
  if (!isAudioClip(clip)) {
    return [];
  }

  return getClipWaveformPeaks(project, clip, Math.max(40, Math.min(160, Math.round(width / 4))));
}

function getPreviewTileWidth(trackClipRowHeight: number): number {
  const clipHeight = Math.max(MIN_CLIP_HEIGHT, trackClipRowHeight - CLIP_VERTICAL_PADDING);
  const pictureHeight = clipHeight - 20;
  if (pictureHeight < 16) return 0;
  const aspectWidth = Math.round((pictureHeight * 16) / 9);
  return Math.min(MAX_PREVIEW_TILE_WIDTH, Math.max(MIN_PREVIEW_TILE_WIDTH, aspectWidth));
}
