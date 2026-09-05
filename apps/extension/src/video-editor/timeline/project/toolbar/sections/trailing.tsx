import { Focus, Maximize2, MousePointer2, Activity, Rows3 } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { TimelineIconButton } from '../../controls/icon-button';
import type { ProjectTimelineToolbarProps } from '../types';
import { ProjectTimelineZoomControl } from './zoom-control';

export function ProjectTimelineToolbarTrailingActions({
  fitSelectionDuration,
  onTimelinePreviewSuspendedChange,
  pixelsPerSecond,
  trackView,
  visibleRangeSeconds,
  onFitProject,
  onFitSelection,
  onZoomChange,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'fitSelectionDuration'
  | 'onFitProject'
  | 'onFitSelection'
  | 'onTimelinePreviewSuspendedChange'
  | 'pixelsPerSecond'
  | 'trackView'
  | 'visibleRangeSeconds'
  | 'onZoomChange'
>) {
  return (
    <div className={['flex min-w-0 flex-nowrap items-center justify-end gap-1'].join(' ')}>
      <ProjectTimelineTrackViewControls trackView={trackView} />
      <ProjectTimelineFitControls
        fitSelectionDuration={fitSelectionDuration}
        onFitProject={onFitProject}
        onFitSelection={onFitSelection}
      />
      <ProjectTimelineZoomControl
        pixelsPerSecond={pixelsPerSecond}
        visibleRangeSeconds={visibleRangeSeconds}
        onPreviewSuspendedChange={onTimelinePreviewSuspendedChange}
        onZoomChange={onZoomChange}
      />
    </div>
  );
}

function ProjectTimelineTrackViewControls({
  trackView,
}: Pick<ProjectTimelineToolbarProps, 'trackView'>) {
  return (
    <div className="flex h-7 items-center gap-1">
      <TimelineIconButton
        active={trackView.compactRows}
        dataUi="video-editor.timeline.toolbar.compact-tracks"
        icon={<Rows3 size={14} strokeWidth={2.2} />}
        onClick={() => trackView.onCompactRowsChange(!trackView.compactRows)}
        title={translate('videoEditor.timeline.trackPanelCompactToggle')}
      />
      <TimelineIconButton
        active={trackView.cursorLaneVisible}
        disabled={!trackView.canShowCursorLane}
        dataUi="video-editor.timeline.toolbar.cursor-lane"
        icon={<MousePointer2 size={14} />}
        onClick={() => trackView.onCursorLaneVisibleChange(!trackView.cursorLaneVisible)}
        title={translate('videoEditor.timeline.cursorLane')}
      />
      <TimelineIconButton
        active={trackView.telemetryLaneVisible}
        disabled={!trackView.canShowTelemetryLane}
        dataUi="video-editor.timeline.toolbar.telemetry-lane"
        icon={<Activity size={14} />}
        onClick={() => trackView.onTelemetryLaneVisibleChange(!trackView.telemetryLaneVisible)}
        title={translate('videoEditor.timeline.telemetryLane')}
      />
    </div>
  );
}

function ProjectTimelineFitControls({
  fitSelectionDuration,
  onFitProject,
  onFitSelection,
}: Pick<ProjectTimelineToolbarProps, 'fitSelectionDuration' | 'onFitProject' | 'onFitSelection'>) {
  return (
    <div className="flex h-7 items-center gap-1">
      <TimelineIconButton
        dataUi="video-editor.timeline.toolbar.fit-project"
        icon={<Maximize2 size={13} strokeWidth={2.2} />}
        onClick={onFitProject}
        title={translate('videoEditor.timeline.fitProject')}
      />
      <TimelineIconButton
        dataUi="video-editor.timeline.toolbar.fit-selection"
        disabled={fitSelectionDuration === null}
        icon={<Focus size={13} strokeWidth={2.2} />}
        onClick={onFitSelection}
        title={translate('videoEditor.timeline.fitSelection')}
      />
    </div>
  );
}
