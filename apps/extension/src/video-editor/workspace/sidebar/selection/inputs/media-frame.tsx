import { getMediaFramingPresets } from '../../../../../features/video/project/factories/framing-presets';
import { InspectorDetails } from '../shared/details';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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
  | 'project'
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
    <div className="space-y-1">
      <MediaFramingPresets {...props} />
      <InspectorDetails label={translate('videoEditor.sidebar.framingFineTune')}>
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
      </InspectorDetails>
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorGroupAppearance')}>
        <MediaShadowControls
          clipId={props.clip.id}
          disabled={props.locked}
          shadowIntensity={props.clip.shadowIntensity ?? 0}
          shadowMode={props.clip.shadowMode ?? VideoMediaShadowMode.BACKDROP}
          onUpdateMediaClipShadowIntensity={props.onUpdateMediaClipShadowIntensity}
          onUpdateMediaClipShadowMode={props.onUpdateMediaClipShadowMode}
        />
      </InspectorDetails>
      <MediaApplyVisualsButton
        clip={props.clip}
        disabled={props.locked}
        onApplyMediaClipVisualsToTrack={props.onApplyMediaClipVisualsToTrack}
      />
    </div>
  );
}

export function MediaFitModeSelect(
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

export function MediaFitScaleControls(
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

export function MediaShadowControls(
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
    <div className="space-y-1">
      <SelectInput
        disabled={props.disabled}
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

export function MediaApplyVisualsButton(
  props: Pick<MediaFrameFieldProps, 'clip' | 'disabled' | 'onApplyMediaClipVisualsToTrack'>
) {
  return (
    <div className="flex justify-end">
      <ProductActionButton
        compact
        tone="secondary"
        disabled={props.disabled || !props.onApplyMediaClipVisualsToTrack}
        onClick={() => props.onApplyMediaClipVisualsToTrack?.(props.clip.id)}
        className="self-end whitespace-nowrap"
      >
        {translate('videoEditor.sidebar.fitApplyToTrackLabel')}
      </ProductActionButton>
    </div>
  );
}

function MediaFramingPresets(props: MediaFrameControlsProps) {
  const clip = props.clip;
  const asset =
    'assetId' in clip ? props.project.assets.find(({ id }) => id === clip.assetId) : undefined;
  if (!asset || !('fitMode' in clip)) return null;
  const presets = getMediaFramingPresets(
    asset.metadata.width,
    asset.metadata.height,
    props.project.width,
    props.project.height
  );
  const labels = [
    translate('videoEditor.sidebar.framingWhole'),
    translate('videoEditor.sidebar.framingBackground'),
    translate('videoEditor.sidebar.framingFill'),
  ];
  const hints = [
    translate('videoEditor.sidebar.framingWholeHint'),
    translate('videoEditor.sidebar.framingBackgroundHint'),
    translate('videoEditor.sidebar.framingFillHint'),
  ];
  return (
    <div className="grid grid-cols-3 gap-1 pb-2" data-ui="video-editor.framing-presets">
      {presets.map((preset, index) => {
        const transform = preset.transform;
        const active =
          clip.fitMode === preset.fitMode &&
          Math.abs((clip.fitScalePercent ?? 100) - preset.fitScalePercent) < 0.01 &&
          (['x', 'y', 'width', 'height', 'rotation'] as const).every(
            (key) => Math.abs(clip.transform[key] - transform[key]) < 0.5
          );
        return (
          <ProductActionButton
            key={preset.id}
            compact
            tone="toggle"
            active={active}
            aria-pressed={active}
            disabled={props.locked}
            aria-label={labels[index]}
            title={hints[index]}
            className="!h-auto min-w-0 flex-col !gap-1 !rounded-[var(--sniptale-radius-sm)] !px-1 !py-2"
            onClick={() =>
              props.onUpdateMediaClipFitMode(clip.id, preset.fitMode, preset.fitScalePercent)
            }
          >
            <svg
              width="52"
              height="32"
              viewBox={`0 0 ${props.project.width} ${props.project.height}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
              className="overflow-hidden rounded-sm"
            >
              <svg width={props.project.width} height={props.project.height} overflow="hidden">
                <rect width="100%" height="100%" fill="var(--sniptale-color-surface-overlay)" />
                <rect
                  x={transform.x}
                  y={transform.y}
                  width={transform.width}
                  height={transform.height}
                  fill="currentColor"
                  opacity="0.5"
                />
              </svg>
            </svg>
            <span className="max-w-full truncate text-[11px]">{labels[index]}</span>
          </ProductActionButton>
        );
      })}
    </div>
  );
}
