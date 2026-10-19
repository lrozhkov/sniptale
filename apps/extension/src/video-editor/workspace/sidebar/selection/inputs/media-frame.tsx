import { getFittedMediaWindowFrame } from '../../../../../features/video/composition/draw/fitted-media';
import { mediaWindowPadding } from '../../../../../features/video/project/window-geometry';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import { MediaCropControls } from './media-crop';
import { useCommandPress } from '@sniptale/ui/control-language/press';
import type { ReactNode } from 'react';
import { WindowHeaderSettings } from '../../../../../workflows/browser-frame/settings';
import {
  maximumMediaPadding,
  getMediaFramingPresets,
} from '../../../../../features/video/project/factories/framing-presets';
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
import { ColorField, SelectInput } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';
import { SliderField } from '../shared/sliders';
import { getMediaFitModeOptions } from './media-fit-options';

type MediaFrameControlsProps = Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'project'
  | 'onEditMediaClip'
  | 'onApplyMediaClipVisualsToTrack'
  | 'onUpdateMediaClipFitMode'
  | 'onUpdateMediaClipFitScalePercent'
  | 'onUpdateMediaClipShadowIntensity'
  | 'onUpdateMediaClipShadowMode'
  | 'onUpdateMediaClipShadowColor'
  | 'onUpdateMediaClipWindowHeader'
> &
  Partial<
    Pick<
      WorkspaceSidebarSelectionPanelProps,
      'recentColors' | 'onRememberRecentColor' | 'currentTime'
    >
  > & {
    clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>;
    locked: boolean;
  };

type MediaFrameClip = Extract<
  NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  { fitMode: VideoMediaFitMode }
>;

type MediaFrameFieldProps = {
  recentColors?: readonly string[] | undefined;
  onRememberRecentColor?: WorkspaceSidebarSelectionPanelProps['onRememberRecentColor'] | undefined;
  clip: MediaFrameClip;
  clipId: string;
  disabled: boolean;
  fitMode: VideoMediaFitMode;
  fitScalePercent: number;
  shadowColor?: string;
  shadowIntensity: number;
  shadowMode: VideoMediaShadowModeValue;
  onApplyMediaClipVisualsToTrack?: WorkspaceSidebarSelectionPanelProps['onApplyMediaClipVisualsToTrack'];
  onUpdateMediaClipFitMode: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipFitMode'];
  onUpdateMediaClipFitScalePercent?: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipFitScalePercent'];
  onUpdateMediaClipShadowIntensity?: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipShadowIntensity'];
  onUpdateMediaClipShadowMode?: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipShadowMode'];
  onUpdateMediaClipShadowColor?: WorkspaceSidebarSelectionPanelProps['onUpdateMediaClipShadowColor'];
};

export function MediaFrameControls(props: MediaFrameControlsProps) {
  if (!isVideoClip(props.clip) && props.clip.type !== VideoProjectClipType.IMAGE) {
    return null;
  }

  const windowCornerRadius = props.clip.windowCornerRadius ?? 0;
  return (
    <div className="sniptale-parameter-stack space-y-1">
      <MediaFramingPresets {...props} />
      <MediaPaddingControl {...props} />
      <MediaCropControls
        key={`crop:${props.clip.id}`}
        project={props.project}
        clip={props.clip}
        currentTime={props.currentTime ?? props.clip.startTime}
        disabled={props.locked}
        onEdit={props.onEditMediaClip}
      />
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
          min={1}
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
        <NumericRow
          label={translate('gallery.videoReview.backgroundCornerRadius')}
          value={windowCornerRadius}
          min={0}
          max={4096}
          step={1}
          precision={2}
          unit="px"
          scrub={{ min: 0, max: 100, step: 1 }}
          disabled={props.locked || !props.onEditMediaClip}
          normalizeValue={(value) =>
            value === Number(windowCornerRadius.toFixed(2)) ? windowCornerRadius : value
          }
          onPreviewValue={() => undefined}
          onCommitValue={(radius) =>
            props.onEditMediaClip?.(props.clip.id, { kind: 'window-corner-radius', radius })
          }
        />
        <MediaShadowControls
          clipId={props.clip.id}
          disabled={props.locked}
          shadowIntensity={props.clip.shadowIntensity ?? 0}
          shadowMode={props.clip.shadowMode ?? VideoMediaShadowMode.BACKDROP}
          {...(props.clip.shadowColor === undefined ? {} : { shadowColor: props.clip.shadowColor })}
          onUpdateMediaClipShadowColor={props.onUpdateMediaClipShadowColor}
          recentColors={props.recentColors}
          onRememberRecentColor={props.onRememberRecentColor}
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
  > & { min?: number }
) {
  return (
    <SliderField
      label={translate('videoEditor.sidebar.fitScalePercentLabel')}
      value={props.fitScalePercent}
      min={props.min ?? 10}
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
    | 'shadowColor'
    | 'recentColors'
    | 'onRememberRecentColor'
    | 'onUpdateMediaClipShadowIntensity'
    | 'onUpdateMediaClipShadowMode'
    | 'onUpdateMediaClipShadowColor'
  >
) {
  return (
    <div className="sniptale-parameter-stack space-y-1" data-ui="video-editor.media-shadow">
      <OptionButtonsField
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
      <ColorField
        label={translate('gallery.videoReview.webcamShadowColor')}
        value={
          props.shadowColor ??
          (props.shadowMode === VideoMediaShadowMode.GLOW ? '#ffffff' : '#000000')
        }
        disabled={props.disabled || !props.onUpdateMediaClipShadowColor}
        onChange={(value) => props.onUpdateMediaClipShadowColor?.(props.clipId, value)}
        recentColors={props.recentColors}
        onRememberRecentColor={props.onRememberRecentColor}
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
    asset.metadata.width * (clip.sourceCrop?.width ?? 1),
    asset.metadata.height * (clip.sourceCrop?.height ?? 1),
    props.project.width,
    props.project.height,
    clip.windowHeader
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

function MediaPaddingControl(props: MediaFrameControlsProps) {
  const clip = props.clip;
  if (!('assetId' in clip) || !('fitMode' in clip)) return null;
  const asset = props.project.assets.find((asset) => asset.id === clip.assetId);
  if (!asset || asset.metadata.width <= 0 || asset.metadata.height <= 0) return null;
  const frame = getFittedMediaWindowFrame({
    frame: clip.transform,
    fitMode: clip.fitMode,
    sourceWidth: asset.metadata.width,
    sourceHeight: asset.metadata.height,
    ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
    ...(clip.windowHeader ? { windowHeader: clip.windowHeader } : {}),
  });
  const max = maximumMediaPadding(props.project.width, props.project.height);
  const padding = Math.min(
    max,
    mediaWindowPadding(props.project, frame, clip.transform.rotation, {
      x: clip.transform.x + clip.transform.width / 2,
      y: clip.transform.y + clip.transform.height / 2,
    })
  );
  return (
    <NumericRow
      label={translate('gallery.videoReview.backgroundPadding')}
      value={padding}
      min={0}
      max={max}
      step={1}
      precision={2}
      unit="px"
      disabled={props.locked || !props.onEditMediaClip}
      normalizeValue={(value) => (value === Number(padding.toFixed(2)) ? padding : value)}
      onPreviewValue={() => undefined}
      onCommitValue={(value) => {
        if (value !== padding)
          props.onEditMediaClip?.(clip.id, { kind: 'padding', padding: value });
      }}
    />
  );
}
