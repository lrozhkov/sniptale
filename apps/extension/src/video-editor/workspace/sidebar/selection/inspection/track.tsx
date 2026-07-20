import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';
import { resolveTrackInspectorControls } from '../track/controls';
import {
  TrackGeneralFields,
  TrackPanelDeleteButton,
  TrackSubtitleLayoutFields,
  TrackSubtitleStyleFields,
} from '../track/sections';

export function InspectTrackPanel({
  onDeleteTrack,
  onUpdateSubtitleTrackStyle,
  selectedTrack,
}: WorkspaceSidebarSelectionPanelProps) {
  if (!selectedTrack) {
    return <SelectionEmptyState />;
  }

  return (
    <TrackInspectorContent
      selectedTrack={selectedTrack}
      onDeleteTrack={onDeleteTrack}
      onUpdateSubtitleTrackStyle={onUpdateSubtitleTrackStyle}
    />
  );
}

function TrackInspectorContent(props: {
  onDeleteTrack: WorkspaceSidebarSelectionPanelProps['onDeleteTrack'];
  onUpdateSubtitleTrackStyle?: WorkspaceSidebarSelectionPanelProps['onUpdateSubtitleTrackStyle'];
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}) {
  const controls = resolveTrackInspectorControls(props.selectedTrack);

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel groups={createTrackGroups(props, controls)} />
      <TrackPanelDeleteButton
        canDeleteTrack={controls.canDeleteTrack}
        trackId={props.selectedTrack.id}
        onDeleteTrack={props.onDeleteTrack}
      />
    </section>
  );
}

function createTrackGroups(
  props: TrackGroupProps,
  controls: ReturnType<typeof resolveTrackInspectorControls>
) {
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
      visible: controls.showGeneralGroup,
    },
    ...createSubtitleTrackGroups(props, controls),
  ] as const;
}

interface TrackGroupProps {
  onUpdateSubtitleTrackStyle?: WorkspaceSidebarSelectionPanelProps['onUpdateSubtitleTrackStyle'];
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}

function createSubtitleTrackGroups(
  props: TrackGroupProps,
  controls: ReturnType<typeof resolveTrackInspectorControls>
) {
  return [
    {
      id: 'layout',
      label: translate('videoEditor.sidebar.inspectorGroupLayout'),
      content: (
        <TrackSubtitleLayoutFields
          controls={controls}
          style={props.selectedTrack.subtitleStyle}
          trackId={props.selectedTrack.id}
          onUpdateSubtitleTrackStyle={props.onUpdateSubtitleTrackStyle}
        />
      ),
      visible: controls.showLayoutGroup,
    },
    {
      id: 'style',
      label: translate('videoEditor.sidebar.inspectorGroupStyle'),
      content: (
        <TrackSubtitleStyleFields
          controls={controls}
          style={props.selectedTrack.subtitleStyle}
          trackId={props.selectedTrack.id}
          onUpdateSubtitleTrackStyle={props.onUpdateSubtitleTrackStyle}
        />
      ),
      visible: controls.showStyleGroup,
    },
  ] as const;
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
