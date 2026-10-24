import {
  isVideoOutputCodecCompatible,
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
  type VideoOutputProfile,
} from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../platform/i18n';
import { CompactSelect } from '../../../../ui/compact-inspector-controls/select';
import {
  InspectorParameterRow,
  InspectorSurface,
} from '../../../../ui/compact-inspector-controls/layout';
import {
  getToolbarCodecLabel,
  getToolbarResolutionLabel,
  isToolbarOutputSupported,
  resolveToolbarOutputContainer,
} from './quality-options';

type OutputChoice<T extends string> = { value: T; label: string; disabled?: boolean };

function OutputChoiceRow<T extends string>(props: {
  label: string;
  name: string;
  value: T;
  options: OutputChoice<T>[];
  disabled: boolean;
  onChange(value: T): void;
}) {
  return (
    <InspectorParameterRow label={props.label} keepInline>
      <CompactSelect
        aria-label={props.label}
        dataUi={`content.toolbar.video-recording.output.${props.name}`}
        appearance="plain"
        controlSize="md"
        disabled={props.disabled}
        value={props.value}
        options={props.options}
        onChange={props.onChange}
      />
    </InspectorParameterRow>
  );
}

export function RecordingOutputSettings(props: {
  profile: VideoOutputProfile;
  pending: boolean;
  onChange(profile: VideoOutputProfile): void;
}) {
  const { profile, pending, onChange } = props;
  const qualityLabels = {
    LOW: translate('popup.labels.qualityLow'),
    MEDIUM: translate('popup.labels.qualityMedium'),
    HIGH: translate('popup.labels.qualityHigh'),
    ULTRA: translate('popup.labels.qualityUltra'),
  };
  return (
    <InspectorSurface className="px-1 pb-1">
      <OutputChoiceRow
        label={translate('popup.video.qualityLabel')}
        name="quality"
        value={profile.quality}
        disabled={pending}
        options={Object.values(VideoQuality).map((value) => ({
          value,
          label: qualityLabels[value],
        }))}
        onChange={(quality) => onChange({ ...profile, quality })}
      />
      <OutputChoiceRow
        label={translate('popup.video.outputLabel')}
        name="container"
        value={profile.container}
        disabled={pending}
        options={Object.values(VideoOutputContainer).map((value) => ({
          value,
          label: value === VideoOutputContainer.WEBM ? 'WebM' : 'MP4',
          disabled: !isToolbarOutputSupported(resolveToolbarOutputContainer(profile, value)),
        }))}
        onChange={(container) => onChange(resolveToolbarOutputContainer(profile, container))}
      />
      <OutputChoiceRow
        label={translate('popup.video.outputCodecLabel')}
        name="codec"
        value={profile.codec}
        disabled={pending}
        options={Object.values(VideoOutputCodec)
          .filter((codec) => isVideoOutputCodecCompatible(profile.container, codec))
          .map((value) => ({
            value,
            label: getToolbarCodecLabel(value),
            disabled: !isToolbarOutputSupported({ ...profile, codec: value }),
          }))}
        onChange={(codec) => onChange({ ...profile, codec })}
      />
      <OutputChoiceRow
        label={translate('popup.video.outputResolutionLabel')}
        name="resolution"
        value={profile.resolution}
        disabled={pending}
        options={Object.values(VideoResolutionPreset).map((value) => ({
          value,
          label: getToolbarResolutionLabel(value),
          disabled: !isToolbarOutputSupported({ ...profile, resolution: value }),
        }))}
        onChange={(resolution) => onChange({ ...profile, resolution })}
      />
      <OutputChoiceRow
        label={translate('popup.video.outputFrameRateLabel')}
        name="frameRate"
        value={String(profile.frameRate)}
        disabled={pending}
        options={Object.values(VideoFrameRate).map((value) => ({
          value: String(value),
          label: `${value} fps`,
          disabled: !isToolbarOutputSupported({ ...profile, frameRate: value }),
        }))}
        onChange={(value) => {
          const frameRate = Object.values(VideoFrameRate).find((entry) => String(entry) === value);
          if (frameRate !== undefined) onChange({ ...profile, frameRate });
        }}
      />
    </InspectorSurface>
  );
}
