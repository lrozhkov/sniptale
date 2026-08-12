import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { VideoProjectTrack } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { DetailItem, DetailList, PANEL_META_CLASS_NAME } from '../shared/panel';

export function TrackGeneralFields(props: {
  selectedTrack: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}) {
  return (
    <>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>{getTrackPanelMeta(props.selectedTrack)}</p>
      <div className="mt-3">
        <DetailList>
          <DetailItem
            label={translate('videoEditor.timeline.tracksTitle')}
            value={props.selectedTrack.kind}
          />
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

function getTrackPanelMeta(track: Pick<VideoProjectTrack, 'kind' | 'locked'>) {
  return [
    track.kind,
    track.locked
      ? translate('videoEditor.timeline.trackLocked')
      : translate('videoEditor.timeline.trackEditable'),
  ].join(' · ');
}
