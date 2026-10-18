import { useCommandPress } from '@sniptale/ui/control-language/press';
import type { ReactNode } from 'react';
import { WindowHeaderSettings } from '../../../../../workflows/browser-frame/settings';
import { getMediaFramingPresets } from '../../../../../features/video/project/factories/framing-presets';
import { InspectorDetails } from '../shared/details';
import { translate } from '../../../../../platform/i18n';
import { InspectorActionButton } from '../shared/actions';
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
  | 'onUpdateMediaClipWindowHeader'
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
    <div className="sniptale-parameter-stack space-y-1">
      <MediaFramingPresets {...props} />
      <InspectorDetails
        preferenceId="media-frame:videoEditor.sidebar.framingFineTune"
        label={translate('videoEditor.sidebar.framingFineTune')}
      >
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
      <InspectorDetails
        preferenceId="media-frame:videoEditor.sidebar.inspectorGroupAppearance"
        label={translate('videoEditor.sidebar.inspectorGroupAppearance')}
      >
        <MediaShadowControls
          clipId={props.clip.id}
          disabled={props.locked}
          shadowIntensity={props.clip.shadowIntensity ?? 0}
          shadowMode={props.clip.shadowMode ?? VideoMediaShadowMode.BACKDROP}
          onUpdateMediaClipShadowIntensity={props.onUpdateMediaClipShadowIntensity}
          onUpdateMediaClipShadowMode={props.onUpdateMediaClipShadowMode}
        />
      </InspectorDetails>
      <WindowHeaderSettings
        key={props.clip.id}
        header={props.clip.windowHeader}
        disabled={props.locked || !props.onUpdateMediaClipWindowHeader}
        onChange={(header) => props.onUpdateMediaClipWindowHeader?.(props.clip.id, header)}
      />
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
    <div className="sniptale-parameter-stack space-y-1">
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
    <InspectorActionButton
      compact
      tone="secondary"
      disabled={props.disabled || !props.onApplyMediaClipVisualsToTrack}
      onClick={() => props.onApplyMediaClipVisualsToTrack?.(props.clip.id)}
      separated
    >
      {translate('videoEditor.sidebar.fitApplyToTrackLabel')}
    </InspectorActionButton>
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
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,84px),1fr))] gap-1 pb-2"
      data-ui="video-editor.framing-presets"
    >
      {presets.map((preset, index) => {
        const transform = preset.transform;
        const active =
          clip.fitMode === preset.fitMode &&
          Math.abs((clip.fitScalePercent ?? 100) - preset.fitScalePercent) < 0.01 &&
          (['x', 'y', 'width', 'height', 'rotation'] as const).every(
            (key) => Math.abs(clip.transform[key] - transform[key]) < 0.5
          );
        return (
          <FramingPresetButton
            key={preset.id}
            active={active}
            disabled={props.locked}
            label={labels[index]}
            hint={hints[index]}
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
              className="shrink-0 overflow-hidden rounded-sm"
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
            <span className="max-w-full whitespace-normal text-[13px] leading-[18px]">
              {labels[index]}
            </span>
          </FramingPresetButton>
        );
      })}
    </div>
  );
}

function FramingPresetButton(props: {
  active: boolean;
  disabled: boolean;
  label: string | undefined;
  hint: string | undefined;
  onClick(): void;
  children: ReactNode;
}) {
  const press = useCommandPress({ disabled: props.disabled, onClick: props.onClick });
  return (
    <button
      {...press.props}
      type="button"
      data-command-press=""
      data-pressing={press.pressed ? 'true' : undefined}
      data-inspector-tone="toggle"
      aria-pressed={props.active}
      aria-label={props.label}
      title={props.hint}
      disabled={props.disabled}
      className={[
        'min-w-0 rounded-[var(--sniptale-radius-sm)] border border-transparent px-1 py-2',
        'text-[var(--sniptale-color-text-secondary)] disabled:opacity-40',
      ].join(' ')}
    >
      <span
        className="sniptale-command-content"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
      >
        {props.children}
      </span>
    </button>
  );
}
