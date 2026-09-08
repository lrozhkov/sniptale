import { getMotionInsertionRange } from '../../../features/video/project/motion/placement';
import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProjectTimelineToolbar } from './toolbar';
import type { ProjectTimelineProps } from './types';
import type { useProjectTimelinePanelPrefs } from './panel/prefs';
import type { useProjectTimelineState } from './interaction-state/index';

type ProjectTimelineSurfaceProps = Pick<
  ProjectTimelineProps & ReturnType<typeof useProjectTimelineState>,
  | 'selection'
  | 'autoProcessing'
  | 'onAutoProcessingModalVisibilityChange'
  | 'onSeek'
  | 'onSeekToEnd'
  | 'onSeekToStart'
  | 'onTogglePlay'
  | 'currentTime'
  | 'isPlaying'
  | 'playbackRange'
  | 'onClearPlaybackRange'
  | 'onStepToNextFrame'
  | 'onStepToPreviousFrame'
  | 'canDeleteSelectedClip'
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
  | 'fitSelectionDuration'
  | 'insertion'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onFitProject'
  | 'onFitSelection'
  | 'onSplitSelectedClip'
  | 'onTimelinePreviewSuspendedChange'
  | 'onZoomChange'
  | 'pixelsPerSecond'
  | 'project'
  | 'recordingTelemetry'
  | 'selectedClip'
> & {
  children: React.ReactNode;
  panelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
};

export function ProjectTimelineSurface(props: ProjectTimelineSurfaceProps) {
  const motionLane = getVideoProjectUtilityLanes(props.project).camera;
  const hasMotionRegions = (props.project.motionRegions?.length ?? 0) > 0;
  return (
    <FloatingChromePanel
      dataUi="video-editor.timeline.surface"
      className={[
        '@container/timeline flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] p-0',
        'backdrop-blur-[10px]',
      ].join(' ')}
    >
      <ProjectTimelineToolbar
        historySelected={props.selection?.kind === 'history-lane'}
        historyActions={{
          project: props.project,
          selection: props.selection,
          actions: props.autoProcessing,
          onSeek: props.onSeek,
          onModalVisibilityChange: props.onAutoProcessingModalVisibilityChange,
        }}
        playback={{
          onSeekToEnd: props.onSeekToEnd,
          onSeekToStart: props.onSeekToStart,
          onTogglePlay: props.onTogglePlay,
          currentTime: props.currentTime,
          isPlaying: props.isPlaying,
          playbackRange: props.playbackRange,
          onClearPlaybackRange: props.onClearPlaybackRange,
          onStepToNextFrame: props.onStepToNextFrame,
          onStepToPreviousFrame: props.onStepToPreviousFrame,
          duration: props.project.duration,
        }}
        canAddMotionRegion={
          getMotionInsertionRange(props.project, props.currentTime) !== null &&
          (!hasMotionRegions || (motionLane.visible && !motionLane.locked))
        }
        canDeleteSelectedClip={props.canDeleteSelectedClip}
        canEditSelectedClip={props.canEditSelectedClip}
        canSplitSelectedClip={props.canSplitSelectedClip}
        fitSelectionDuration={props.fitSelectionDuration}
        insertion={props.insertion}
        pixelsPerSecond={props.pixelsPerSecond}
        selectedClip={Boolean(props.selectedClip)}
        onFitProject={props.onFitProject}
        onFitSelection={props.onFitSelection}
        onTimelinePreviewSuspendedChange={props.onTimelinePreviewSuspendedChange}
        onZoomChange={props.onZoomChange}
        onSplitSelectedClip={props.onSplitSelectedClip}
        onDuplicateSelectedClip={props.onDuplicateSelectedClip}
        onDeleteSelectedClip={props.onDeleteSelectedClip}
      />
      {props.children}
    </FloatingChromePanel>
  );
}
