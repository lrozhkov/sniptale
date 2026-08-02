import { translate } from '../../../platform/i18n';
import { NumericRow, SelectField, StatusRow } from '../../../ui/compact-inspector-controls';
import {
  resolveVideoOutputDimensions,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
  VideoProjectExportSettingsPatch,
} from '../../../features/video/project/types';
import {
  VideoExportFormat,
  VideoMp4Codec,
  VideoExportScope,
  VideoExportQualityPreset,
  VideoWebmCodec,
} from '../../../features/video/project/types';
import { getMp4CodecOptions } from './codec-options';
import type { ExportDialogFieldParams } from './field-contract';

const EXPORT_QUALITY_OPTIONS = [
  {
    value: VideoExportQualityPreset.LOW,
    label: translate('videoEditor.exportDialog.qualityLow'),
  },
  {
    value: VideoExportQualityPreset.MEDIUM,
    label: translate('videoEditor.exportDialog.qualityMedium'),
  },
  {
    value: VideoExportQualityPreset.HIGH,
    label: translate('videoEditor.exportDialog.qualityHigh'),
  },
  {
    value: VideoExportQualityPreset.ULTRA,
    label: translate('videoEditor.exportDialog.qualityUltra'),
  },
] as const;

const EXPORT_RESOLUTION_OPTIONS = [
  VideoResolutionPreset.SOURCE,
  VideoResolutionPreset.P240,
  VideoResolutionPreset.P360,
  VideoResolutionPreset.P480,
  VideoResolutionPreset.P720,
  VideoResolutionPreset.P1080,
  VideoResolutionPreset.P1440,
  VideoResolutionPreset.P2160,
].map((value) => ({
  value,
  label:
    value === VideoResolutionPreset.SOURCE
      ? translate('videoEditor.exportDialog.resolutionSource')
      : value === VideoResolutionPreset.P1440
        ? '1440p (2K)'
        : value === VideoResolutionPreset.P2160
          ? '2160p (4K)'
          : value.toLowerCase(),
}));

const WEBM_CODEC_OPTIONS = [
  { value: VideoWebmCodec.VP9, label: 'VP9' },
  { value: VideoWebmCodec.VP8, label: 'VP8' },
] as const;

function getExportScopeOptions(selectedClipAvailable: boolean) {
  return [
    {
      value: VideoExportScope.PROJECT,
      label: translate('videoEditor.exportDialog.scopeProjectLabel'),
    },
    ...(selectedClipAvailable
      ? [
          {
            value: VideoExportScope.SELECTED_CLIP,
            label: translate('videoEditor.exportDialog.scopeSelectedClipLabel'),
          },
        ]
      : []),
  ] as const;
}

function getExportFormatOptions(capabilities?: VideoExportCapabilities | null) {
  if (!capabilities) {
    return [
      {
        value: VideoExportFormat.WEBM,
        label: translate('videoEditor.exportDialog.formatWebmLabel'),
      },
      {
        value: VideoExportFormat.MP4,
        label: translate('videoEditor.exportDialog.formatMp4Label'),
      },
    ] as const;
  }

  const availableFormats = capabilities.formats.filter((entry) => entry.available);
  if (availableFormats.length === 0) {
    return [
      {
        value: VideoExportFormat.WEBM,
        label: translate('videoEditor.exportDialog.formatWebmLabel'),
      },
    ] as const;
  }

  return availableFormats.map((entry) => ({
    value: entry.format,
    label:
      entry.format === VideoExportFormat.MP4
        ? translate('videoEditor.exportDialog.formatMp4Label')
        : translate('videoEditor.exportDialog.formatWebmLabel'),
  }));
}

function ExportDialogCodecField<TCodec extends string>(props: {
  codecOptions: ReadonlyArray<{ label: string; value: TCodec }>;
  currentCodec: TCodec;
  onChange: (codec: TCodec) => void;
}) {
  const label = translate('videoEditor.exportDialog.codecLabel');

  return (
    <>
      {props.codecOptions.length === 1 ? (
        <StatusRow label={label} value={props.codecOptions[0]?.label ?? ''} />
      ) : (
        <SelectField
          label={label}
          value={props.currentCodec}
          onChange={props.onChange}
          options={props.codecOptions}
        />
      )}
    </>
  );
}

function buildFormatPatch(args: {
  capabilities: VideoExportCapabilities | null | undefined;
  format: VideoExportFormat;
  settings: VideoProjectExportSettings;
}): VideoProjectExportSettingsPatch {
  if (args.format === VideoExportFormat.WEBM) {
    return {
      format: args.format,
      mp4VideoCodec: undefined,
      webmVideoCodec: args.settings.webmVideoCodec ?? VideoWebmCodec.VP9,
    };
  }

  return {
    format: args.format,
    mp4VideoCodec:
      args.settings.mp4VideoCodec ?? args.capabilities?.defaultMp4VideoCodec ?? VideoMp4Codec.AVC,
    webmVideoCodec: undefined,
  };
}

export function ExportDialogSelectFields(params: ExportDialogFieldParams) {
  const { capabilities, onChange, selectedClipAvailable, settings, sourceDimensions } = params;
  const scopeOptions = getExportScopeOptions(selectedClipAvailable);
  const currentScope = settings.scope ?? VideoExportScope.PROJECT;
  const formatOptions = getExportFormatOptions(capabilities);
  const codecOptions = capabilities ? getMp4CodecOptions(capabilities) : [];
  const currentCodec = settings.mp4VideoCodec ?? codecOptions[0]?.value ?? VideoMp4Codec.AVC;
  const currentResolution = settings.resolution;

  return (
    <>
      <SelectField
        label={translate('videoEditor.exportDialog.scopeLabel')}
        value={currentScope}
        onChange={(scope) => onChange({ scope })}
        options={scopeOptions}
      />
      <SelectField
        label={translate('videoEditor.exportDialog.formatLabel')}
        value={settings.format}
        onChange={(format) => onChange(buildFormatPatch({ capabilities, format, settings }))}
        options={formatOptions}
      />
      {settings.format === VideoExportFormat.MP4 && codecOptions.length > 0 ? (
        <ExportDialogCodecField
          codecOptions={codecOptions}
          currentCodec={currentCodec}
          onChange={(mp4VideoCodec) => onChange({ mp4VideoCodec })}
        />
      ) : null}
      {settings.format === VideoExportFormat.WEBM ? (
        <ExportDialogCodecField
          codecOptions={WEBM_CODEC_OPTIONS}
          currentCodec={settings.webmVideoCodec}
          onChange={(webmVideoCodec) => onChange({ webmVideoCodec })}
        />
      ) : null}
      <SelectField
        label={translate('videoEditor.exportDialog.resolutionLabel')}
        value={currentResolution}
        onChange={(resolution) => {
          const dimensions = resolveVideoOutputDimensions(
            sourceDimensions.width,
            sourceDimensions.height,
            resolution
          );
          onChange({ resolution, ...dimensions });
        }}
        options={EXPORT_RESOLUTION_OPTIONS}
      />
      <SelectField
        label={translate('videoEditor.exportDialog.qualityLabel')}
        value={settings.quality}
        onChange={(quality) => onChange({ quality })}
        options={EXPORT_QUALITY_OPTIONS}
      />
    </>
  );
}

export function ExportDialogNumberField(params: {
  className?: string;
  label: string;
  max?: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <NumericRow
      label={params.label}
      min={params.min}
      step={params.step}
      value={params.value}
      onPreviewValue={params.onChange}
      onCommitValue={params.onChange}
      {...(params.className === undefined ? {} : { className: params.className })}
      {...(params.max === undefined ? {} : { max: params.max })}
    />
  );
}
