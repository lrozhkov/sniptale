import type { TimelineProjection } from '../interaction-state/projection';
import type React from 'react';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import type { TimelineClipPreview } from '../../../contracts/timeline-preview';
import type { DragMode } from '../types';

export interface ProjectTimelineClipProps {
  hideClipNames?: boolean;
  clip: VideoProjectClip;
  isHovered: boolean;
  isSelected: boolean;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  preview?: TimelineClipPreview;
  project: VideoProject;
  trackClipTop?: number;
  trackClipRowHeight?: number;
  trackLocked: boolean;
  onSelectClip: (clipId: string | null, intent?: 'replace' | 'toggle' | 'range') => void;
  onClipHoverChange: (clipId: string | null) => void;
  onBeginClipInteraction: (
    event: React.PointerEvent,
    clip: VideoProjectClip,
    mode: DragMode
  ) => void;
}

export interface ProjectTimelineClipViewModel {
  visible: boolean;
  includesStart: boolean;
  includesEnd: boolean;
  offsetSeconds: number;
  visibleDuration: number;
  bodyInsetLeft: number;
  bodyInsetRight: number;
  clipClassName: string;
  edgeClassName: string;
  fadeInOverlayWidth: number;
  fadeInOverlayStyle: React.CSSProperties;
  fadeOutOverlayWidth: number;
  fadeOutOverlayStyle: React.CSSProperties;
  labelHeight: number;
  labelStyle: React.CSSProperties;
  left: number;
  style: React.CSSProperties;
  previewTileWidth: number;
  trimHandleClassName: string;
  visualEmphasis: boolean;
  waveformEnvelopeEnd: number;
  waveformEnvelopeStart: number;
  waveformPeaks: number[];
  width: number;
}

export interface ProjectTimelineClipLayoutProps {
  clip: VideoProjectClip;
  preview?: TimelineClipPreview;
  project: VideoProject;
  trackLocked: boolean;
  viewModel: ProjectTimelineClipViewModel;
  onSelectClip: ProjectTimelineClipProps['onSelectClip'];
  onClipHoverChange: ProjectTimelineClipProps['onClipHoverChange'];
  onBeginClipInteraction: ProjectTimelineClipProps['onBeginClipInteraction'];
}
