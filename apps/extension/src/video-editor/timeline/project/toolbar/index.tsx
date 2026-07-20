import { ProjectTimelineToolbarLeadingControls } from './sections/leading';
import { ProjectTimelinePlaybackSummary } from './sections/playback-summary';
import { ProjectTimelineToolbarTrailingActions } from './sections/trailing';
import type { ProjectTimelineToolbarProps } from './types';

type ToolbarTrailingControlsInput = Pick<
  ProjectTimelineToolbarProps,
  | 'fitSelectionDuration'
  | 'pixelsPerSecond'
  | 'trackView'
  | 'visibleRangeSeconds'
  | 'onFitProject'
  | 'onFitSelection'
  | 'onTimelinePreviewSuspendedChange'
  | 'onZoomChange'
>;

function createToolbarLeadingControlsProps({
  insertion,
  selectedClip,
  canAutoTransformRecording,
  onAutoTransformRecording,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'insertion'
  | 'selectedClip'
  | 'canAutoTransformRecording'
  | 'onAutoTransformRecording'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  return {
    insertion,
    selectedClip,
    canAutoTransformRecording: canAutoTransformRecording ?? false,
    ...(onAutoTransformRecording ? { onAutoTransformRecording } : {}),
    onDeleteSelectedClip,
    onDuplicateSelectedClip,
    onSplitSelectedClip,
  };
}

function createToolbarTrailingControlsProps({
  fitSelectionDuration,
  pixelsPerSecond,
  trackView,
  visibleRangeSeconds,
  onFitProject,
  onFitSelection,
  onTimelinePreviewSuspendedChange,
  onZoomChange,
}: ToolbarTrailingControlsInput) {
  return {
    fitSelectionDuration,
    pixelsPerSecond,
    trackView,
    visibleRangeSeconds,
    onFitProject,
    onFitSelection,
    onTimelinePreviewSuspendedChange,
    onZoomChange,
  };
}

export function ProjectTimelineToolbar({
  currentTime,
  duration,
  isPlaying,
  playbackRange,
  onSeekToStart,
  onTogglePlay,
  onClearPlaybackRange,
  ...controlsProps
}: ProjectTimelineToolbarProps) {
  return (
    <div
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b',
        'border-[color:var(--sniptale-color-border-soft)] px-3 py-1.5',
        'max-[720px]:grid-cols-1 max-[720px]:gap-1.5',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center justify-start">
        <ProjectTimelineToolbarLeadingControls
          {...createToolbarLeadingControlsProps(controlsProps)}
        />
      </div>
      <ProjectTimelinePlaybackSummary
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        playbackRange={playbackRange}
        onSeekToStart={onSeekToStart}
        onTogglePlay={onTogglePlay}
        onClearPlaybackRange={onClearPlaybackRange}
      />
      <ProjectTimelineToolbarTrailingActions
        {...createToolbarTrailingControlsProps(controlsProps)}
      />
    </div>
  );
}
