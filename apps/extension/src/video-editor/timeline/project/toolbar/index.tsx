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
  canAddMotionRegion,
  canEditSelectedClip,
  insertion,
  canSplitSelectedClip,
  selectedClip,
  canAutoTransformRecording,
  onAutoTransformRecording,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'canAddMotionRegion'
  | 'canEditSelectedClip'
  | 'insertion'
  | 'canSplitSelectedClip'
  | 'selectedClip'
  | 'canAutoTransformRecording'
  | 'onAutoTransformRecording'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  return {
    canAddMotionRegion,
    canEditSelectedClip,
    insertion,
    canSplitSelectedClip,
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
  onSeekToEnd,
  onSeekToStart,
  onStepToNextFrame,
  onStepToPreviousFrame,
  onTogglePlay,
  onClearPlaybackRange,
  ...controlsProps
}: ProjectTimelineToolbarProps) {
  return (
    <div
      data-ui="video-editor.timeline.toolbar"
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b',
        'border-[color:var(--sniptale-color-border-soft)] px-3 py-1.5',
        '@max-[1360px]/timeline:grid-cols-[minmax(0,1fr)_auto] @max-[1360px]/timeline:gap-y-0',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center justify-start @max-[1120px]/timeline:col-span-2">
        <ProjectTimelineToolbarLeadingControls
          {...createToolbarLeadingControlsProps(controlsProps)}
        />
      </div>
      <ProjectTimelinePlaybackSummary
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        playbackRange={playbackRange}
        onSeekToEnd={onSeekToEnd}
        onSeekToStart={onSeekToStart}
        onStepToNextFrame={onStepToNextFrame}
        onStepToPreviousFrame={onStepToPreviousFrame}
        onTogglePlay={onTogglePlay}
        onClearPlaybackRange={onClearPlaybackRange}
      />
      <ProjectTimelineToolbarTrailingActions
        {...createToolbarTrailingControlsProps(controlsProps)}
      />
    </div>
  );
}
