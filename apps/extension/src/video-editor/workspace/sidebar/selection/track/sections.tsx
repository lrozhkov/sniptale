import { ArrowUp, ArrowDown } from 'lucide-react';
import { useWorkspaceTrackPresentation } from '../../../surface/track-presentation';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { StatusRow, TextField, NumericRow } from '../../../../../ui/compact-inspector-controls';
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

export function TrackLayoutFields({
  track,
}: {
  track: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTrack']>;
}) {
  const presentation = useWorkspaceTrackPresentation();
  if (!presentation) return null;
  const { panelPrefs, tracks, onMoveTrack } = presentation;
  const position = tracks.findIndex(({ id }) => id === track.id);
  const setHeight = (value: number) =>
    panelPrefs.setTrackHeight(track.id, Math.round(value / 0.25) * 0.25);
  return (
    <div className="mt-3 space-y-2" data-ui="video-editor.inspector.track-layout">
      <NumericRow
        appearance="plain"
        scrub={{ min: 0.5, max: 3 }}
        label={translate('videoEditor.timeline.trackHeight')}
        value={panelPrefs.prefs.trackHeightByTrackId[track.id] ?? 1}
        min={0.5}
        max={3}
        step={0.25}
        precision={2}
        normalizeValue={(value) => Math.round(value / 0.25) * 0.25}
        unit="x"
        onPreviewValue={setHeight}
        onCommitValue={setHeight}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.app.trackOrder')}
        </span>
        <div className="flex gap-1">
          <ProductActionButton
            compact
            tone="secondary"
            className="!h-7 !min-w-7 !px-1.5"
            disabled={position <= 0}
            onClick={() => onMoveTrack(track.id, 'up')}
          >
            <ArrowUp size={14} aria-hidden="true" />
            <span className="sr-only">{translate('videoEditor.timeline.moveTrackUp')}</span>
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="secondary"
            className="!h-7 !min-w-7 !px-1.5"
            disabled={position < 0 || position === tracks.length - 1}
            onClick={() => onMoveTrack(track.id, 'down')}
          >
            <ArrowDown size={14} aria-hidden="true" />
            <span className="sr-only">{translate('videoEditor.timeline.moveTrackDown')}</span>
          </ProductActionButton>
        </div>
      </div>
    </div>
  );
}
