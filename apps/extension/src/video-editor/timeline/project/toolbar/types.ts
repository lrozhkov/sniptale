import type { ProjectTimelineInsertionActions } from '../types';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';

export interface ProjectTimelineToolbarProps {
  canAddMotionRegion: boolean;
  canEditSelectedClip: boolean;
  canSplitSelectedClip: boolean;
  fitSelectionDuration: number | null;
  insertion: ProjectTimelineInsertionActions;
  pixelsPerSecond: number;
  selectedClip: boolean;
  trackView: {
    compactRows: boolean;
    panelExpanded: boolean;
    onCompactRowsChange: (compactRows: boolean) => void;
    onPanelExpandedChange: (expanded: boolean) => void;
  };
  visibleRangeSeconds: number;
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
