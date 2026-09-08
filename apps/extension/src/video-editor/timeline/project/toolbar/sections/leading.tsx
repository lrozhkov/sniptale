import { ProjectTimelineAutoProcessingControl } from './auto-transform-wizard';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { MousePointerClick } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { getVideoProjectActionPresentation } from '../../../../../features/video/project/action-presentation';
import { getVideoProjectUtilityLanes } from '../../../../../features/video/project/utility-lanes';
import { toolbarButtonClassName } from './constants/button';
import type { ProjectTimelineToolbarProps } from '../types';
import { ProjectTimelineAddControls } from './add-controls';
import { ProjectTimelineClipActions } from './clip-actions';

export function ProjectTimelineToolbarLeadingControls({
  historyActions,
  historySelected,
  canAddMotionRegion,
  canDeleteSelectedClip,
  canEditSelectedClip,
  canSplitSelectedClip,
  insertion,
  selectedClip,
  onDeleteSelectedClip,
  onDuplicateSelectedClip,
  onSplitSelectedClip,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'historyActions'
  | 'historySelected'
  | 'canAddMotionRegion'
  | 'canDeleteSelectedClip'
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
  | 'insertion'
  | 'selectedClip'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onSplitSelectedClip'
>) {
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1">
      {historyActions ? (
        <ProjectTimelineAutoProcessingControl
          {...historyActions}
          visible={historySelected ?? false}
        />
      ) : null}
      {historyActions && historySelected ? (
        <ContentToolbarButton
          className={toolbarButtonClassName}
          dataUi="video-editor.timeline.toolbar.add-click"
          title={translate('videoEditor.timeline.historyAddClick')}
          disabled={getVideoProjectUtilityLanes(historyActions.project).actions.locked}
          onClick={() =>
            insertion.onAddActionEvent(
              getVideoProjectActionPresentation(historyActions.project).clickPreset
            )
          }
        >
          <MousePointerClick size={14} aria-hidden="true" />
          <span className="@max-[1600px]/timeline:sr-only">
            {translate('videoEditor.timeline.historyAddClick')}
          </span>
        </ContentToolbarButton>
      ) : null}
      <ProjectTimelineAddControls insertion={insertion} canAddMotionRegion={canAddMotionRegion} />
      <div
        className={[
          'flex shrink-0 items-center gap-[var(--timeline-control-gap)] border-l',
          'border-[color:var(--sniptale-color-border-soft)] pl-1',
        ].join(' ')}
      >
        <ProjectTimelineClipActions
          canDeleteSelectedClip={canDeleteSelectedClip}
          canEditSelectedClip={canEditSelectedClip}
          canSplitSelectedClip={canSplitSelectedClip}
          selectedClip={selectedClip}
          onDeleteSelectedClip={onDeleteSelectedClip}
          onDuplicateSelectedClip={onDuplicateSelectedClip}
          onSplitSelectedClip={onSplitSelectedClip}
        />
      </div>
    </div>
  );
}
