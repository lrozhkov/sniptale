import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { isVideoClip } from '../../../../../features/video/project/timeline';
import {
  VideoProjectClipType,
  VideoMediaShadowMode,
} from '../../../../../features/video/project/types';
import type {
  VideoMediaFitMode,
  VideoMediaShadowMode as VideoMediaShadowModeValue,
} from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { SelectInput } from '../shared/controls';
import { SliderField } from '../shared/sliders';
import { getMediaFitModeOptions } from './media-fit-options';

type MediaFrameControlsProps = Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'onApplyMediaClipVisualsToTrack'
  | 'onUpdateMediaClipFitMode'
  | 'onUpdateMediaClipFitScalePercent'
  | 'onUpdateMediaClipShadowIntensity'
  | 'onUpdateMediaClipShadowMode'
> & {
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>;
  locked: boolean;
};

type MediaFrameClip = Extract<
  NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  { fitMode: VideoMediaFitMode }
>;

type MediaFrameFieldProps = {
  clip: MediaFrameClip;
  clipId: string;
  disabled: boolean;
  fitMode: VideoMediaFitMode;
  fitScalePercent: number;
  shadowIntensity: number;
  shadowMode: VideoMediaShadowModeValue;
  onApplyMediaClipVisualsToTrack?: WorkspaceSidebarSelectionPanelProps['onApplyMediaClipVisualsToTrack'];
  onUpdateMediaClipFitMode: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipFitMode'];
  onUpdateMediaClipFitScalePercent?: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipFitScalePercent'];
  onUpdateMediaClipShadowIntensity?: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipShadowIntensity'];
  onUpdateMediaClipShadowMode?: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipShadowMode'];
};

export function MediaFrameControls(props: MediaFrameControlsProps) {
  if (!isVideoClip(props.clip) && props.clip.type !== VideoProjectClipType.IMAGE) {
    return null;
  }

  return (
    <div className="space-y-3">
      <MediaFitModeSelect
        clipId={props.clip.id}
        disabled={props.locked}
        fitMode={props.clip.fitMode}
        onUpdateMediaClipFitMode={props.onUpdateMediaClipFitMode}
      />
      <MediaFitScaleControls
        clipId={props.clip.id}
        disabled={props.locked}
        fitScalePercent={props.clip.fitScalePercent ?? 100}
        onUpdateMediaClipFitScalePercent={props.onUpdateMediaClipFitScalePercent}
      />
      <MediaShadowControls
        clipId={props.clip.id}
        disabled={props.locked}
        shadowIntensity={props.clip.shadowIntensity ?? 0}
        shadowMode={props.clip.shadowMode ?? VideoMediaShadowMode.BACKDROP}
        onUpdateMediaClipShadowIntensity={props.onUpdateMediaClipShadowIntensity}
        onUpdateMediaClipShadowMode={props.onUpdateMediaClipShadowMode}
      />
      <MediaApplyVisualsButton
        clip={props.clip}
        disabled={props.locked}
        onApplyMediaClipVisualsToTrack={props.onApplyMediaClipVisualsToTrack}
      />
    </div>
  );
}

function MediaFitModeSelect(
  props: Pick<MediaFrameFieldProps, 'clipId' | 'disabled' | 'fitMode' | 'onUpdateMediaClipFitMode'>
) {
  return (
    <SelectInput
      label={translate('videoEditor.sidebar.fitModeLabel')}
      value={props.fitMode}
      disabled={props.disabled}
      onChange={(value) => props.onUpdateMediaClipFitMode(props.clipId, value)}
      options={getMediaFitModeOptions()}
    />
  );
}

function MediaFitScaleControls(
  props: Pick<
    MediaFrameFieldProps,
    'clipId' | 'disabled' | 'fitScalePercent' | 'onUpdateMediaClipFitScalePercent'
  >
) {
  return (
    <SliderField
      label={translate('videoEditor.sidebar.fitScalePercentLabel')}
      value={props.fitScalePercent}
      min={10}
      max={300}
      step={1}
      disabled={props.disabled}
      formatValue={(value) => `${Math.round(value)}%`}
      onChange={(value) => props.onUpdateMediaClipFitScalePercent?.(props.clipId, value)}
    />
  );
}

function MediaShadowControls(
  props: Pick<
    MediaFrameFieldProps,
    | 'clipId'
    | 'disabled'
    | 'shadowIntensity'
    | 'shadowMode'
    | 'onUpdateMediaClipShadowIntensity'
    | 'onUpdateMediaClipShadowMode'
  >
) {
  return (
    <div className="space-y-3">
      <SegmentedRow
        ariaLabel={translate('videoEditor.sidebar.mediaShadowModeLabel')}
        columns={2}
        label={translate('videoEditor.sidebar.mediaShadowModeLabel')}
        value={props.shadowMode}
        onChange={(value) => props.onUpdateMediaClipShadowMode?.(props.clipId, value)}
        options={getMediaShadowModeOptions(props.disabled)}
      />
      <SliderField
        label={translate('videoEditor.sidebar.mediaShadowIntensityLabel')}
        value={props.shadowIntensity}
        min={0}
        max={100}
        step={1}
        disabled={props.disabled}
        formatValue={(value) => `${Math.round(value)}%`}
        onChange={(value) => props.onUpdateMediaClipShadowIntensity?.(props.clipId, value)}
      />
    </div>
  );
}

function getMediaShadowModeOptions(disabled: boolean) {
  return [
    {
      value: VideoMediaShadowMode.BACKDROP,
      label: translate('videoEditor.sidebar.mediaShadowModeBackdrop'),
      disabled,
    },
    {
      value: VideoMediaShadowMode.GLOW,
      label: translate('videoEditor.sidebar.mediaShadowModeGlow'),
      disabled,
    },
  ];
}

function MediaApplyVisualsButton(
  props: Pick<MediaFrameFieldProps, 'clip' | 'disabled' | 'onApplyMediaClipVisualsToTrack'>
) {
  return (
    <div className="flex justify-end">
      <ProductActionButton
        compact
        tone="secondary"
        disabled={props.disabled}
        onClick={() => props.onApplyMediaClipVisualsToTrack?.(props.clip.id)}
        className="self-end whitespace-nowrap"
      >
        {translate('videoEditor.sidebar.fitApplyToTrackLabel')}
      </ProductActionButton>
    </div>
  );
}
