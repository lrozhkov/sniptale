import type { AutoProcessingHeaderProps } from './sections/auto-transform-wizard';
import type { ComponentProps } from 'react';
import type { ProjectTimelinePlaybackSummary } from './sections/playback-summary';
import type { ProjectTimelineInsertionActions } from '../types';

export interface ProjectTimelineToolbarProps {
  historyActions?: AutoProcessingHeaderProps;
  historySelected?: boolean;
  playback: ComponentProps<typeof ProjectTimelinePlaybackSummary>;
  canAddMotionRegion: boolean;
  canDeleteSelectedClip: boolean;
  canEditSelectedClip: boolean;
  canSplitSelectedClip: boolean;
  fitSelectionDuration: number | null;
  insertion: ProjectTimelineInsertionActions;
  pixelsPerSecond: number;
  selectedClip: boolean;
  onFitProject: () => void;
  onFitSelection: () => void;
  onZoomChange: (value: number) => void;
  onSplitSelectedClip: () => void;
  onDuplicateSelectedClip: () => void;
  onDeleteSelectedClip: () => void;
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
}
