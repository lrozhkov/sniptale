import type { ProjectTimelineInsertionActions } from '../types';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';

export interface ProjectTimelineToolbarProps {
  currentTime: number;
  duration: number;
  fitSelectionDuration: number | null;
  insertion: ProjectTimelineInsertionActions;
  isPlaying: boolean;
  pixelsPerSecond: number;
  playbackRange: VideoEditorPlaybackRange | null;
  selectedClip: boolean;
  trackView: {
    compactRows: boolean;
    panelExpanded: boolean;
    onCompactRowsChange: (compactRows: boolean) => void;
    onPanelExpandedChange: (expanded: boolean) => void;
  };
  visibleRangeSeconds: number;
  canAutoTransformRecording?: boolean;
  onClearPlaybackRange: () => void;
  onFitProject: () => void;
  onFitSelection: () => void;
  onZoomChange: (value: number) => void;
  onSeekToStart: () => void;
  onTogglePlay: () => void;
  onSplitSelectedClip: () => void;
  onDuplicateSelectedClip: () => void;
  onDeleteSelectedClip: () => void;
  onAutoTransformRecording?: (settings: VideoAutoProcessingSettings) => void;
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
}
