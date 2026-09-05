import { ProjectTimelineToolbarLeadingControls } from './sections/leading';
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

export function ProjectTimelineToolbar(controlsProps: ProjectTimelineToolbarProps) {
  return (
    <div
      data-ui="video-editor.timeline.toolbar"
      className={[
        'flex items-center justify-between gap-3 border-b',
        'border-[color:var(--sniptale-color-border-soft)] px-3 py-1.5',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center justify-start">
        <ProjectTimelineToolbarLeadingControls
          {...createToolbarLeadingControlsProps(controlsProps)}
        />
      </div>
      <ProjectTimelineToolbarTrailingActions
        {...createToolbarTrailingControlsProps(controlsProps)}
      />
    </div>
  );
}
