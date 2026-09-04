import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { SelectionEmptyState } from './helpers';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';
import { TrackGeneralFields, TrackPanelDeleteButton } from '../track/sections';
import { isVideoEditorPresentedTrack } from '../../../../project/operations/presented-tracks';

export function InspectTrackPanel({
  onDeleteTrack,
  onRenameTrack,
  selectedTrack,
}: WorkspaceSidebarSelectionPanelProps) {
  if (!selectedTrack || !isVideoEditorPresentedTrack(selectedTrack)) {
    return <SelectionEmptyState />;
  }

  return (
    <TrackInspectorContent
      selectedTrack={selectedTrack}
      onDeleteTrack={onDeleteTrack}
      onRenameTrack={onRenameTrack}
    />
  );
}

function TrackInspectorContent(props: {
  onDeleteTrack: WorkspaceSidebarSelectionPanelProps['onDeleteTrack'];
  onRenameTrack: WorkspaceSidebarSelectionPanelProps['onRenameTrack'];
  onUpdateSubtitleTrackStyle?: WorkspaceSidebarSelectionPanelProps['onUpdateSubtitleTrackStyle'];
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}) {
  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <TrackGeneralFields selectedTrack={props.selectedTrack} onRenameTrack={props.onRenameTrack} />
      <TrackPanelDeleteButton
        canDeleteTrack={!props.selectedTrack.isRoot}
        trackId={props.selectedTrack.id}
        onDeleteTrack={props.onDeleteTrack}
      />
    </section>
  );
}
