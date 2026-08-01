import { translate } from '../../../../../platform/i18n';
import { openSettingsPage } from '../../../../../platform/navigation/extension-pages';
import {
  resolveVideoRecordingOutputSettings,
  VideoOutputContainer,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { getQualityOption, QUALITY_OPTIONS } from '../quality-card/options';
import {
  getAvailableOutputCodecs,
  getOutputCodecLabel,
  getOutputContainerLabel,
  getOutputResolutionLabel,
  OUTPUT_RESOLUTION_PRESETS,
  resolveOutputForContainer,
} from './options';

type OutputOption<TValue extends string> = { label: string; value: TValue };

export function OutputSettingsPanel(props: {
  onChange: (patch: Partial<VideoRecordingSettings>) => void;
  settings: VideoRecordingSettings;
}) {
  const output = resolveVideoRecordingOutputSettings(props.settings);
  const hasAudioTracks = props.settings.microphoneEnabled || props.settings.systemAudioEnabled;
  const codecOptions = getAvailableOutputCodecs(
    output.container,
    output.resolution,
    hasAudioTracks
  ).map((codec) => ({ label: getOutputCodecLabel(codec), value: codec }));
  const containerOptions = [VideoOutputContainer.WEBM, VideoOutputContainer.MP4]
    .filter(
      (container) =>
        getAvailableOutputCodecs(container, output.resolution, hasAudioTracks).length > 0
    )
    .map((container) => ({ label: getOutputContainerLabel(container), value: container }));
  const update = (patch: Partial<VideoRecordingSettings>) =>
    props.onChange({ ...patch, qualityProfileId: null });

  return (
    <div className="grid gap-3">
      <div className="pr-8 text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('popup.video.outputSettingsTitle')}
      </div>
      <OutputOptionGroup
        activeValue={props.settings.quality}
        label={translate('popup.video.qualityLabel')}
        onChange={(quality) => update({ quality })}
        options={QUALITY_OPTIONS.map((option) => ({
          label: getQualityOption(option.value).label,
          value: option.value,
        }))}
      />
      <OutputOptionGroup
        activeValue={output.container}
        label={translate('popup.video.outputLabel')}
        onChange={(container) =>
          update({
            output: resolveOutputForContainer({
              container,
              current: output,
              hasAudioTracks,
            }),
          })
        }
        options={containerOptions}
      />
      <OutputOptionGroup
        activeValue={output.codec}
        label={translate('popup.video.outputCodecLabel')}
        onChange={(codec) => update({ output: { ...output, codec } })}
        options={codecOptions}
      />
      <OutputOptionGroup
        activeValue={output.resolution}
        label={translate('popup.video.outputResolutionLabel')}
        onChange={(resolution) => update({ output: { ...output, resolution } })}
        options={OUTPUT_RESOLUTION_PRESETS.map((resolution) => ({
          label: getOutputResolutionLabel(resolution),
          value: resolution,
        }))}
      />
      <p className="px-0.5 text-[10px] leading-4 text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.outputAspectNotice')}
      </p>
      <button
        type="button"
        className={[
          'min-h-8 rounded-[8px] border border-[var(--sniptale-color-border-soft)] px-2',
          'text-xs font-medium text-[var(--sniptale-color-text-secondary)] transition-colors',
          'hover:bg-[var(--sniptale-color-surface-hover)]',
          'hover:text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
        onClick={() => void openSettingsPage({ section: 'video' })}
      >
        {translate('popup.video.manageQualityProfiles')}
      </button>
    </div>
  );
}

function OutputOptionGroup<TValue extends string>(props: {
  activeValue: TValue;
  label: string;
  onChange: (value: TValue) => void;
  options: Array<OutputOption<TValue>>;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="px-0.5 text-[10px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
        {props.label}
      </div>
      <div className="grid gap-1">
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={[
              'min-h-7 rounded-[7px] px-2 text-left text-xs font-medium transition-colors',
              option.value === props.activeValue
                ? [
                    'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]',
                    'text-[var(--sniptale-color-accent)]',
                  ].join(' ')
                : [
                    'text-[var(--sniptale-color-text-secondary)]',
                    'hover:bg-[var(--sniptale-color-surface-hover)]',
                    'hover:text-[var(--sniptale-color-text-primary)]',
                  ].join(' '),
            ].join(' ')}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
