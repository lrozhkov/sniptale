import { ProjectTimelinePlaybackSummary } from './sections/playback-summary';
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
        'flex items-center justify-between gap-2 border-b',
        'border-[color:var(--sniptale-color-border-soft)] px-3 py-2',
        '@max-[1000px]/timeline:px-2 @max-[1000px]/timeline:py-1',
        '[--timeline-control-height:36px] [--timeline-control-width:36px] [--timeline-control-gap:6px]',
        '@max-[1400px]/timeline:[--timeline-control-height:32px]',
        '@max-[1400px]/timeline:[--timeline-control-width:32px]',
        '@max-[1400px]/timeline:[--timeline-control-gap:4px]',
        '@max-[1000px]/timeline:[--timeline-control-height:28px]',
        '@max-[1000px]/timeline:[--timeline-control-width:24px]',
        '@max-[1000px]/timeline:[--timeline-control-gap:2px]',
        '[&_svg]:size-[18px] @max-[1400px]/timeline:[&_svg]:size-4 @max-[1000px]/timeline:[&_svg]:size-[14px]',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-center justify-start">
        <ProjectTimelineToolbarLeadingControls
          {...createToolbarLeadingControlsProps(controlsProps)}
        />
      </div>
      <ProjectTimelinePlaybackSummary {...controlsProps.playback} />
      <ProjectTimelineToolbarTrailingActions
        {...createToolbarTrailingControlsProps(controlsProps)}
      />
    </div>
  );
}
