import type { ComponentProps } from 'react';
import type { ProjectTimelinePlaybackSummary } from './sections/playback-summary';
import type { ProjectTimelineInsertionActions } from '../types';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';

export interface ProjectTimelineToolbarProps {
  playback: ComponentProps<typeof ProjectTimelinePlaybackSummary>;
  canAddMotionRegion: boolean;
  canEditSelectedClip: boolean;
  canSplitSelectedClip: boolean;
  fitSelectionDuration: number | null;
  insertion: ProjectTimelineInsertionActions;
  pixelsPerSecond: number;
  selectedClip: boolean;
  canAutoTransformRecording?: boolean;
  onFitProject: () => void;
  onFitSelection: () => void;
  onZoomChange: (value: number) => void;
  onSplitSelectedClip: () => void;
  onDuplicateSelectedClip: () => void;
  onDeleteSelectedClip: () => void;
  onAutoTransformRecording?: (settings: VideoAutoProcessingSettings) => void;
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
}
