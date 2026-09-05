import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProjectTimelineToolbar } from './toolbar';
import type { ProjectTimelineProps } from './types';
import type { useProjectTimelinePanelPrefs } from './panel/prefs';
import type { useProjectTimelineState } from './interaction-state/index';
import { isRecordingTelemetryEligibleForAutoProcessing } from '../../project/operations/telemetry-eligibility';

type ProjectTimelineSurfaceProps = Pick<
  ProjectTimelineProps & ReturnType<typeof useProjectTimelineState>,
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
  | 'fitSelectionDuration'
  | 'insertion'
  | 'onAutoTransformRecording'
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
  | 'visibleRangeSeconds'
> & {
  children: React.ReactNode;
  panelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
};

export function ProjectTimelineSurface(props: ProjectTimelineSurfaceProps) {
  const motionLane = getVideoProjectUtilityLanes(props.project).camera;
  return (
    <FloatingChromePanel
      dataUi="video-editor.timeline.surface"
      className={[
        '@container/timeline flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] p-0',
        'backdrop-blur-[10px]',
      ].join(' ')}
    >
      <ProjectTimelineToolbar
        canAddMotionRegion={props.project.duration > 0 && motionLane.visible && !motionLane.locked}
        canEditSelectedClip={props.canEditSelectedClip}
        canSplitSelectedClip={props.canSplitSelectedClip}
        fitSelectionDuration={props.fitSelectionDuration}
        insertion={props.insertion}
        pixelsPerSecond={props.pixelsPerSecond}
        selectedClip={Boolean(props.selectedClip)}
        trackView={{
          compactRows: props.panelPrefs.prefs.compactRows,
          panelExpanded: props.panelPrefs.prefs.panelExpanded,
          onCompactRowsChange: props.panelPrefs.setCompactRows,
          onPanelExpandedChange: props.panelPrefs.setPanelExpanded,
        }}
        visibleRangeSeconds={props.visibleRangeSeconds}
        canAutoTransformRecording={isRecordingTelemetryEligibleForAutoProcessing(
          props.project,
          props.recordingTelemetry
        )}
        onAutoTransformRecording={props.onAutoTransformRecording}
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
