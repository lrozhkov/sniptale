import { Focus, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-[720px]:justify-start">
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
    <div className="flex h-10 items-center gap-1">
      <TimelineIconButton
        active={trackView.compactRows}
        dataUi="video-editor.timeline.toolbar.compact-tracks"
        icon={<Minimize2 size={13} strokeWidth={2.2} />}
        onClick={() => trackView.onCompactRowsChange(!trackView.compactRows)}
        title={translate('videoEditor.timeline.trackPanelCompactToggle')}
      />
      <TimelineIconButton
        active={trackView.panelExpanded}
        dataUi="video-editor.timeline.toolbar.expand-track-panel"
        icon={
          trackView.panelExpanded ? (
            <PanelLeftClose size={13} strokeWidth={2.2} />
          ) : (
            <PanelLeftOpen size={13} strokeWidth={2.2} />
          )
        }
        onClick={() => trackView.onPanelExpandedChange(!trackView.panelExpanded)}
        title={translate('videoEditor.timeline.trackPanelToggle')}
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
    <div className="flex h-10 items-center gap-1">
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
