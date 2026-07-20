import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type {
  VideoProjectSubtitleTrackStyle,
  VideoProjectTrack,
} from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { DetailItem, DetailList, PANEL_META_CLASS_NAME } from '../shared/panel';
import { OptionButtonsField } from '../shared/option-buttons';
import { SliderField } from '../shared/sliders';
import type { TrackInspectorControls } from './controls';
import { getSubtitlePlacementOptions } from './options';

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

export function TrackSubtitleStyleFields(props: {
  controls: TrackInspectorControls;
  onUpdateSubtitleTrackStyle?: WorkspaceSidebarSelectionPanelProps['onUpdateSubtitleTrackStyle'];
  style: VideoProjectSubtitleTrackStyle | undefined;
  trackId: string;
}) {
  if (!props.style) {
    return null;
  }

  return (
    <div className="space-y-3">
      {props.controls.showSubtitleFontSize ? (
        <TrackStyleSliderField
          label={translate('videoEditor.sidebar.textSizeLabel')}
          min={10}
          max={160}
          value={props.style.fontSize}
          onChange={(value) =>
            props.onUpdateSubtitleTrackStyle?.(props.trackId, { fontSize: value })
          }
        />
      ) : null}
      {props.controls.showSubtitlePadding ? (
        <TrackStyleSliderField
          label={translate('videoEditor.sidebar.textPaddingLabel')}
          min={0}
          max={96}
          value={props.style.padding}
          onChange={(value) =>
            props.onUpdateSubtitleTrackStyle?.(props.trackId, { padding: value })
          }
        />
      ) : null}
    </div>
  );
}

export function TrackSubtitleLayoutFields(props: {
  controls: TrackInspectorControls;
  onUpdateSubtitleTrackStyle?: WorkspaceSidebarSelectionPanelProps['onUpdateSubtitleTrackStyle'];
  style: VideoProjectSubtitleTrackStyle | undefined;
  trackId: string;
}) {
  if (!props.style) {
    return null;
  }

  return (
    <div className="space-y-3">
      {props.controls.showSafeAreaPercent ? (
        <TrackStyleSliderField
          label={translate('videoEditor.sidebar.subtitleSafeAreaLabel')}
          min={1}
          max={40}
          value={props.style.safeAreaPercent}
          onChange={(value) =>
            props.onUpdateSubtitleTrackStyle?.(props.trackId, { safeAreaPercent: value })
          }
          formatValue={(value) => `${Math.round(value)}%`}
        />
      ) : null}
      {props.controls.showSubtitleMaxWidthPercent ? (
        <TrackStyleSliderField
          label={translate('videoEditor.sidebar.subtitleMaxWidthLabel')}
          min={20}
          max={100}
          value={props.style.maxWidthPercent}
          onChange={(value) =>
            props.onUpdateSubtitleTrackStyle?.(props.trackId, { maxWidthPercent: value })
          }
          formatValue={(value) => `${Math.round(value)}%`}
        />
      ) : null}
      {props.controls.showPlacement ? (
        <OptionButtonsField
          label={translate('videoEditor.sidebar.subtitlePlacementLabel')}
          value={props.style.placement}
          onChange={(placement) => props.onUpdateSubtitleTrackStyle?.(props.trackId, { placement })}
          options={getSubtitlePlacementOptions()}
        />
      ) : null}
    </div>
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

function TrackStyleSliderField(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
  formatValue?: (value: number) => string;
}) {
  return (
    <SliderField
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      onChange={props.onChange}
      {...(props.formatValue === undefined ? {} : { formatValue: props.formatValue })}
    />
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
