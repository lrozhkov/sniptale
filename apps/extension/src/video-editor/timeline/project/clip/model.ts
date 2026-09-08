import { projectTimelineInterval } from '../interaction-state/projection';
import type React from 'react';
import { getClipWaveformPeaks, isAudioClip } from '../../../../features/video/project/timeline';
import { getClipGainRange } from '../../../../features/video/project/timeline/basics';
import { getTrackJunctions } from '../../../../features/video/project/transition/junctions';
import type { ProjectTimelineClipProps, ProjectTimelineClipViewModel } from './types';

const DEFAULT_CLIP_ROW_HEIGHT = 62;
const MIN_CLIP_HEIGHT = 22;
const CLIP_VERTICAL_PADDING = 18;
const LABEL_BASE_INSET = 12;
const TRIM_HANDLE_CLASS_NAME = [
  'absolute inset-y-0 z-30 w-[min(10px,25%)] !cursor-ew-resize disabled:pointer-events-none',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_20%,transparent)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_32%,transparent)]',
].join(' ');

export function buildProjectTimelineClipViewModel({
  hideClipNames = false,
  clip,
  isHovered,
  isSelected,
  pixelsPerSecond,
  projection,
  project,
  trackClipTop = 0,
  trackClipRowHeight = DEFAULT_CLIP_ROW_HEIGHT,
  trackLocked,
}: Pick<
  ProjectTimelineClipProps,
  | 'hideClipNames'
  | 'clip'
  | 'isHovered'
  | 'isSelected'
  | 'pixelsPerSecond'
  | 'projection'
  | 'project'
  | 'trackClipTop'
  | 'trackClipRowHeight'
  | 'trackLocked'
>): ProjectTimelineClipViewModel {
  const interval = projection
    ? projectTimelineInterval(projection, clip.startTime, clip.startTime + clip.duration)
    : {
        left: clip.startTime * pixelsPerSecond,
        width: Math.max(1, clip.duration * pixelsPerSecond),
        offsetSeconds: 0,
        durationSeconds: clip.duration,
        includesStart: true,
        includesEnd: true,
      };
  const width = interval ? Math.max(1, interval.width) : 0;
  const offsetSeconds = interval?.offsetSeconds ?? 0;
  const visibleDuration = interval?.durationSeconds ?? 0;
  const transitionViewModel = getTimelineClipTransitionViewModel({
    clip,
    pixelsPerSecond,
    project,
    width,
    offsetPixels: offsetSeconds * pixelsPerSecond,
  });
  const gainRange = getClipGainRange(clip);
  const visualEmphasis = isHovered || isSelected;
  const waveformPeaks = getTimelineClipWaveformPeaks({
    clip,
    project,
    width,
    offsetSeconds,
    visibleDuration,
  });

  const fadeIn = getFadeOverlay(
    clip.fadeInMs,
    clip.duration,
    offsetSeconds,
    visibleDuration,
    pixelsPerSecond,
    false
  );
  const fadeOut = getFadeOverlay(
    clip.fadeOutMs,
    clip.duration,
    offsetSeconds,
    visibleDuration,
    pixelsPerSecond,
    true
  );
  const startFraction = clip.duration > 0 ? offsetSeconds / clip.duration : 0;
  const endFraction = clip.duration > 0 ? (offsetSeconds + visibleDuration) / clip.duration : 1;
  return {
    visible: interval !== null,
    includesStart: interval?.includesStart ?? false,
    includesEnd: interval?.includesEnd ?? false,
    offsetSeconds,
    visibleDuration,
    clipClassName: getTimelineClipClassName({ isSelected, isHovered, trackLocked }),
    edgeClassName: getTimelineClipEdgeClassName(visualEmphasis),
    fadeInOverlayWidth: fadeIn.width,
    fadeOutOverlayWidth: fadeOut.width,
    fadeInOverlayStyle: fadeIn.style,
    fadeOutOverlayStyle: fadeOut.style,
    left: interval?.left ?? 0,
    previewTileWidth: getPreviewTileWidth(trackClipRowHeight, hideClipNames),
    style: {
      ...getTimelineClipStyle(trackClipRowHeight, trackClipTop ?? 0),
      // Only mask junction sides; a vertical mask clips subpixel-positioned contours.
      clipPath: `inset(-1px ${transitionViewModel.bodyInsetRight}px -1px ${transitionViewModel.bodyInsetLeft}px)`,
    },
    ...transitionViewModel,
    labelHeight:
      hideClipNames ||
      (isAudioClip(clip) &&
        Math.max(MIN_CLIP_HEIGHT, trackClipRowHeight - CLIP_VERTICAL_PADDING) < 36)
        ? 0
        : 20,
    labelStyle: {
      left: LABEL_BASE_INSET + Math.max(transitionViewModel.bodyInsetLeft, -(interval?.left ?? 0)),
      right:
        LABEL_BASE_INSET +
        Math.max(
          transitionViewModel.bodyInsetRight,
          projection && interval ? interval.left + width - projection.viewportWidth : 0
        ),
    },
    trimHandleClassName: TRIM_HANDLE_CLASS_NAME,
    waveformPeaks,
    waveformEnvelopeEnd: gainRange.start + (gainRange.end - gainRange.start) * endFraction,
    waveformEnvelopeStart: gainRange.start + (gainRange.end - gainRange.start) * startFraction,
    width,
    visualEmphasis,
  };
}

function getTimelineClipTransitionViewModel({
  clip,
  pixelsPerSecond,
  project,
  width,
  offsetPixels,
}: Pick<ProjectTimelineClipProps, 'clip' | 'pixelsPerSecond' | 'project'> &
  Pick<ProjectTimelineClipViewModel, 'width'> & { offsetPixels: number }) {
  let bodyInsetLeft = 0;
  let bodyInsetRight = 0;
  for (const junction of getTrackJunctions(project)) {
    const fullWidth = Math.max(1, clip.duration * pixelsPerSecond);
    const halfOverlap = Math.min(fullWidth, junction.duration * pixelsPerSecond) / 2;
    if (junction.trailingClip.id === clip.id)
      bodyInsetLeft = Math.min(width, Math.max(0, halfOverlap - offsetPixels));
    if (junction.leadingClip.id === clip.id)
      bodyInsetRight = Math.min(
        width,
        Math.max(0, halfOverlap - (fullWidth - offsetPixels - width))
      );
  }
  return {
    bodyInsetLeft,
    bodyInsetRight,
  };
}

function getTimelineClipClassName({
  isHovered,
  isSelected,
  trackLocked,
}: Pick<ProjectTimelineClipProps, 'isHovered' | 'isSelected' | 'trackLocked'>): string {
  return [
    'pointer-events-auto absolute flex items-center overflow-hidden rounded-sm',
    'video-editor-timeline-item',
    'outline outline-1 -outline-offset-1',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]',
    'text-xs text-[var(--sniptale-color-text-primary-strong)]',
    'shadow-[0_1px_3px_color-mix(in_srgb,var(--sniptale-color-text-primary)_8%,transparent)]',
    'outline-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_24%,transparent)]',
    isSelected ? 'video-editor-timeline-item-selected' : '',
    isHovered ? 'video-editor-timeline-item-hovered' : '',
    trackLocked ? 'opacity-55 !cursor-pointer' : '!cursor-grab',
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

function getFadeOverlay(
  fadeMs: number,
  duration: number,
  offset: number,
  visibleDuration: number,
  scale: number,
  outgoing: boolean
) {
  const fadeDuration = Math.min(duration / 2, Math.max(0, fadeMs / 1000));
  const fadeStart = outgoing ? duration - fadeDuration : 0;
  const start = Math.max(offset, fadeStart);
  const end = Math.min(offset + visibleDuration, fadeStart + fadeDuration);
  if (end <= start || fadeDuration <= 0) return { width: 0, style: {} };
  const positions = [start, fadeStart + fadeDuration / 2, end].filter(
    (time) => time >= start && time <= end
  );
  const stops = positions.map((time) => {
    const progress = (time - fadeStart) / fadeDuration;
    const ratio = outgoing ? 1 - progress : progress;
    const alpha = ratio <= 0.5 ? 58 - ratio * 68 : 48 * (1 - ratio);
    const position = ((time - start) / (end - start)) * 100;
    return `color-mix(in srgb,var(--sniptale-color-surface-canvas) ${alpha}%,transparent) ${position}%`;
  });
  const width = (end - start) * scale;
  return {
    width,
    style: {
      left: (start - offset) * scale,
      width,
      backgroundImage: `linear-gradient(to right,${stops.join(',')})`,
    },
  };
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
  offsetSeconds,
  visibleDuration,
}: Pick<ProjectTimelineClipProps, 'clip' | 'project'> & {
  width: number;
  offsetSeconds: number;
  visibleDuration: number;
}): number[] {
  if (!isAudioClip(clip)) {
    return [];
  }

  const sourceRate = clip.duration > 0 ? clip.sourceDuration / clip.duration : 1;
  const samplingClip = {
    ...clip,
    sourceStart: clip.sourceStart + offsetSeconds * sourceRate,
    sourceDuration: visibleDuration * sourceRate,
  };
  return getClipWaveformPeaks(
    project,
    samplingClip,
    Math.max(40, Math.min(160, Math.round(width / 4)))
  );
}

function getPreviewTileWidth(trackClipRowHeight: number, hideClipNames: boolean): number {
  const clipHeight = Math.max(MIN_CLIP_HEIGHT, trackClipRowHeight - CLIP_VERTICAL_PADDING);
  const pictureHeight = clipHeight - (hideClipNames ? 0 : 20);
  if (pictureHeight < 16) return 0;
  return (pictureHeight * 16) / 9;
}
