import { Redo2, Undo2, Magnet, Clapperboard } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import {
  useVideoEditorHistoryController,
  useVideoEditorHeaderController,
} from '../../../runtime/controller/composition/hooks';
import { toolbarIconButtonClassName } from './sections/constants/button';
import { ProjectTimelinePlaybackSummary } from './sections/playback-summary';
import { ProjectTimelineToolbarLeadingControls } from './sections/leading';
import { ProjectTimelineToolbarTrailingActions } from './sections/trailing';
import type { ProjectTimelineToolbarProps } from './types';

type ToolbarTrailingControlsInput = Pick<
  ProjectTimelineToolbarProps,
  | 'fitSelectionDuration'
  | 'pixelsPerSecond'
  | 'onFitProject'
  | 'onFitSelection'
  | 'onTimelinePreviewSuspendedChange'
  | 'onZoomChange'
>;

function createToolbarLeadingControlsProps({
  canAddMotionRegion,
  hasMotionRegions,
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
  | 'hasMotionRegions'
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
    hasMotionRegions,
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
  onFitProject,
  onFitSelection,
  onTimelinePreviewSuspendedChange,
  onZoomChange,
}: ToolbarTrailingControlsInput) {
  return {
    fitSelectionDuration,
    pixelsPerSecond,
    onFitProject,
    onFitSelection,
    onTimelinePreviewSuspendedChange,
    onZoomChange,
  };
}

export function ProjectTimelineToolbar(controlsProps: ProjectTimelineToolbarProps) {
  const history = useVideoEditorHistoryController();
  const header = useVideoEditorHeaderController();
  return (
    <div
      data-ui="video-editor.timeline.toolbar"
      className={[
        'grid grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 border-b',
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
      <div className="flex shrink-0 items-center justify-start gap-[var(--timeline-control-gap)]">
        <ContentToolbarButton
          className={toolbarIconButtonClassName}
          title={`${translate('videoEditor.app.undo')} (${translate('videoEditor.app.undoShortcut')})`}
          disabled={!history.canUndo}
          onClick={history.onUndo}
          dataUi="video-editor.timeline.toolbar.undo"
        >
          <Undo2 aria-hidden="true" />
        </ContentToolbarButton>
        <ContentToolbarButton
          className={toolbarIconButtonClassName}
          title={`${translate('videoEditor.app.redo')} (${translate('videoEditor.app.redoShortcut')})`}
          disabled={!history.canRedo}
          onClick={history.onRedo}
          dataUi="video-editor.timeline.toolbar.redo"
        >
          <Redo2 aria-hidden="true" />
        </ContentToolbarButton>
        {header && (
          <ContentToolbarButton
            className={toolbarIconButtonClassName}
            title={translate('videoEditor.app.magnetButton')}
            active={header.grid.magnetEnabled}
            aria-pressed={header.grid.magnetEnabled}
            onClick={header.grid.onToggleMagnet}
            dataUi="video-editor.timeline.toolbar.magnet"
          >
            <Magnet aria-hidden="true" />
          </ContentToolbarButton>
        )}
        <ProjectTimelineToolbarLeadingControls
          {...createToolbarLeadingControlsProps(controlsProps)}
        />
      </div>
      <ProjectTimelinePlaybackSummary {...controlsProps.playback} />
      <div className="flex items-center justify-end gap-[var(--timeline-control-gap)]">
        <ProjectTimelineToolbarTrailingActions
          {...createToolbarTrailingControlsProps(controlsProps)}
        />
        {header && (
          <ContentToolbarButton
            className={toolbarIconButtonClassName}
            title={translate('videoEditor.app.exportButton')}
            onClick={header.onOpenExportDialog}
            dataUi="video-editor.timeline.toolbar.export"
          >
            <Clapperboard aria-hidden="true" />
          </ContentToolbarButton>
        )}
      </div>
    </div>
  );
}
