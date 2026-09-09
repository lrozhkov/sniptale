import { BetweenHorizontalStart, ScanLine } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { TimelineIconButton } from '../../controls/icon-button';
import type { ProjectTimelineToolbarProps } from '../types';
import { ProjectTimelineZoomControl } from './zoom-control';

export function ProjectTimelineToolbarTrailingActions({
  fitSelectionDuration,
  onTimelinePreviewSuspendedChange,
  pixelsPerSecond,
  zoomContext,
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
  | 'zoomContext'
  | 'onZoomChange'
>) {
  return (
    <div
      className={[
        'flex min-w-0 flex-nowrap items-center justify-end gap-[var(--timeline-control-gap)]',
      ].join(' ')}
    >
      <ProjectTimelineZoomControl
        pixelsPerSecond={pixelsPerSecond}
        zoomContext={zoomContext}
        onPreviewSuspendedChange={onTimelinePreviewSuspendedChange}
        onZoomChange={onZoomChange}
      />
      <ProjectTimelineFitControls
        fitSelectionDuration={fitSelectionDuration}
        onFitProject={onFitProject}
        onFitSelection={onFitSelection}
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
    <div className="flex items-center gap-[var(--timeline-control-gap)]">
      <TimelineIconButton
        dataUi="video-editor.timeline.toolbar.fit-project"
        icon={<BetweenHorizontalStart size={16} strokeWidth={2} />}
        onClick={onFitProject}
        title={translate('videoEditor.timeline.fitProject')}
      />
      <TimelineIconButton
        dataUi="video-editor.timeline.toolbar.fit-selection"
        disabled={fitSelectionDuration === null}
        icon={<ScanLine size={16} strokeWidth={2} />}
        onClick={onFitSelection}
        title={translate('videoEditor.timeline.fitSelection')}
      />
    </div>
  );
}
