import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';
import { TrackGeneralFields, TrackPanelDeleteButton } from '../track/sections';
import { isVideoEditorPresentedTrack } from '../../../../project/operations/presented-tracks';

export function InspectTrackPanel({
  onDeleteTrack,
  selectedTrack,
}: WorkspaceSidebarSelectionPanelProps) {
  if (!selectedTrack || !isVideoEditorPresentedTrack(selectedTrack)) {
    return <SelectionEmptyState />;
  }

  return <TrackInspectorContent selectedTrack={selectedTrack} onDeleteTrack={onDeleteTrack} />;
}

function TrackInspectorContent(props: {
  onDeleteTrack: WorkspaceSidebarSelectionPanelProps['onDeleteTrack'];
  onUpdateSubtitleTrackStyle?: WorkspaceSidebarSelectionPanelProps['onUpdateSubtitleTrackStyle'];
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}) {
  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel groups={createTrackGroups(props)} />
      <TrackPanelDeleteButton
        canDeleteTrack={!props.selectedTrack.isRoot}
        trackId={props.selectedTrack.id}
        onDeleteTrack={props.onDeleteTrack}
      />
    </section>
  );
}

function createTrackGroups(props: TrackGroupProps) {
  return [
    {
      id: 'info',
      label: translate('videoEditor.sidebar.inspectorGroupInfo'),
      content: <TrackInfo selectedTrack={props.selectedTrack} />,
    },
    {
      id: 'general',
      label: translate('videoEditor.sidebar.inspectorGroupGeneral'),
      defaultActive: true,
      content: <TrackGeneralFields selectedTrack={props.selectedTrack} />,
    },
  ] as const;
}

interface TrackGroupProps {
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}

function TrackInfo(props: {
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}) {
  return (
    <p className="text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
      {props.selectedTrack.kind}
    </p>
  );
}
