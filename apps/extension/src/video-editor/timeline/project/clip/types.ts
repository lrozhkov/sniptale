import type React from 'react';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import type { TimelineClipPreview } from '../../../contracts/timeline-preview';
import type { DragMode } from '../types';

export interface ProjectTimelineClipProps {
  clip: VideoProjectClip;
  isHovered: boolean;
  isSelected: boolean;
  pixelsPerSecond: number;
  preview?: TimelineClipPreview;
  project: VideoProject;
  trackClipTop?: number;
  trackClipRowHeight?: number;
  trackLocked: boolean;
  onSelectClip: (clipId: string | null) => void;
  onClipHoverChange: (clipId: string | null) => void;
  onBeginClipInteraction: (
    event: React.PointerEvent,
    clip: VideoProjectClip,
    mode: DragMode
  ) => void;
}

export interface ProjectTimelineClipViewModel {
  clipClassName: string;
  edgeClassName: string;
  fadeInOverlayWidth: number;
  fadeOutOverlayWidth: number;
  hasIncomingCrossfade: boolean;
  hasOutgoingCrossfade: boolean;
  incomingCrossfadeOverlayWidth: number;
  incomingCrossfadeTitle: string;
  labelStyle: React.CSSProperties;
  left: number;
  outgoingCrossfadeOverlayWidth: number;
  outgoingCrossfadeTitle: string;
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
