import { createEffectInstanceGroups } from '../effect-instance/groups';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { useWorkspaceTrackPresentation } from '../../../surface/track-presentation';
import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { SelectionEmptyState } from './helpers';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';
import { TrackGeneralFields, TrackLayoutFields, TrackPanelDeleteButton } from '../track/sections';
import { isVideoEditorPresentedTrack } from '../../../../project/operations/presented-tracks';

export function InspectTrackPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const { selectedTrack } = props;
  if (!selectedTrack || !isVideoEditorPresentedTrack(selectedTrack)) {
    return <SelectionEmptyState />;
  }
  return <TrackInspectorContent {...props} selectedTrack={selectedTrack} />;
}

function TrackInspectorContent(
  props: WorkspaceSidebarSelectionPanelProps & {
    selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
  }
) {
  const presentation = useWorkspaceTrackPresentation();
  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel
        groups={[
          ...createEffectInstanceGroups({
            project: props.project,
            target: { kind: 'track', trackId: props.selectedTrack.id },
            disabled: props.selectedTrack.locked,
            onDeleteEffectInstance: props.onDeleteEffectInstance ?? (() => undefined),
            onDuplicateEffectInstance: props.onDuplicateEffectInstance ?? (() => null),
            onMoveEffectInstance: props.onMoveEffectInstance ?? (() => undefined),
            onUpdateEffectInstance: props.onUpdateEffectInstance ?? (() => undefined),
          }),
          {
            id: 'general',
            semantic: 'track',
            defaultActive: true,
            label: translate('videoEditor.sidebar.inspectorGroupGeneral'),
            content: (
              <TrackGeneralFields
                selectedTrack={props.selectedTrack}
                onRenameTrack={props.onRenameTrack}
                onToggleTrackLock={props.onToggleTrackLock}
                onToggleTrackVisibility={props.onToggleTrackVisibility}
              />
            ),
          },
          {
            id: 'display',
            semantic: 'appearance',
            visible: !!presentation,
            label: translate('videoEditor.sidebar.inspectorDisplay'),
            content: <TrackLayoutFields track={props.selectedTrack} />,
          },
        ]}
      />
      <TrackPanelDeleteButton
        canDeleteTrack={!props.selectedTrack.isRoot}
        trackId={props.selectedTrack.id}
        onDeleteTrack={props.onDeleteTrack}
      />
    </section>
  );
}
