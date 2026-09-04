import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { StatusRow, TextField } from '../../../../../ui/compact-inspector-controls';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { ToggleField } from '../shared/controls';
import { getVideoTrackKindLabel } from '../../track-kind-label';

export function TrackGeneralFields(props: {
  onRenameTrack?: WorkspaceSidebarSelectionPanelProps['onRenameTrack'];
  onToggleTrackLock?: WorkspaceSidebarSelectionPanelProps['onToggleTrackLock'];
  onToggleTrackVisibility?: WorkspaceSidebarSelectionPanelProps['onToggleTrackVisibility'];
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
      <div className="mt-3 space-y-2">
        <StatusRow label={translate('videoEditor.sidebar.trackTypeLabel')} value={kindLabel} />
        <ToggleField
          checked={props.selectedTrack.visible}
          disabled={!props.onToggleTrackVisibility}
          label={translate('videoEditor.sidebar.trackVisibilityLabel')}
          onChange={() => props.onToggleTrackVisibility?.(props.selectedTrack.id)}
        />
        <ToggleField
          checked={props.selectedTrack.locked}
          disabled={!props.onToggleTrackLock}
          label={translate('videoEditor.sidebar.trackLockLabel')}
          onChange={() => props.onToggleTrackLock?.(props.selectedTrack.id)}
        />
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
