import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { TextField } from '../../../../../ui/compact-inspector-controls';
import type { VideoProjectTrack } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { DetailItem, DetailList, PANEL_META_CLASS_NAME } from '../shared/panel';
import { getVideoTrackKindLabel } from '../../track-kind-label';

export function TrackGeneralFields(props: {
  onRenameTrack?: WorkspaceSidebarSelectionPanelProps['onRenameTrack'];
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}) {
  const kindLabel = getVideoTrackKindLabel(props.selectedTrack.kind);

  return (
    <>
      <TextField
        key={`${props.selectedTrack.id}:${props.selectedTrack.name}`}
        defaultValue={props.selectedTrack.name}
        label={translate('videoEditor.sidebar.trackNameLabel')}
        readOnly={!props.onRenameTrack}
        onValueCommit={(name) => props.onRenameTrack?.(props.selectedTrack.id, name)}
      />
      <p className={`mt-3 ${PANEL_META_CLASS_NAME}`}>
        {getTrackPanelMeta(kindLabel, props.selectedTrack.locked)}
      </p>
      <div className="mt-3">
        <DetailList>
          <DetailItem label={translate('videoEditor.timeline.tracksTitle')} value={kindLabel} />
          <DetailItem
            label={translate('videoEditor.sidebar.selectionTitle')}
            value={
              props.selectedTrack.locked
                ? translate('videoEditor.timeline.trackLocked')
                : translate('videoEditor.timeline.trackEditable')
            }
          />
          <DetailItem
            label={translate('videoEditor.timeline.trackVisible')}
            value={
              props.selectedTrack.visible
                ? translate('videoEditor.timeline.trackVisible')
                : translate('videoEditor.timeline.trackHidden')
            }
          />
        </DetailList>
      </div>
    </>
  );
}

export function TrackPanelDeleteButton(props: {
  canDeleteTrack: boolean;
  onDeleteTrack: WorkspaceSidebarSelectionPanelProps['onDeleteTrack'];
  trackId: string;
}) {
  if (!props.canDeleteTrack) {
    return null;
  }

  return (
    <ProductActionButton
      compact
      tone="danger"
      onClick={() => props.onDeleteTrack?.(props.trackId)}
      className="mt-3 w-full"
    >
      {translate('videoEditor.timeline.deleteTrackTitle')}
    </ProductActionButton>
  );
}

function getTrackPanelMeta(kindLabel: string, locked: VideoProjectTrack['locked']) {
  return [
    kindLabel,
    locked
      ? translate('videoEditor.timeline.trackLocked')
      : translate('videoEditor.timeline.trackEditable'),
  ].join(' · ');
}
