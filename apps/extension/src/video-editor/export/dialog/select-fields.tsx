import { translate } from '../../../platform/i18n';
import { NumericRow, SelectField, StatusRow } from '../../../ui/compact-inspector-controls';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';
import {
  VideoExportFormat,
  VideoMp4Codec,
  VideoExportScope,
  VideoExportQualityPreset,
} from '../../../features/video/project/types';
import { getMp4CodecOptions } from './codec-options';

const EXPORT_QUALITY_OPTIONS = [
  {
    value: VideoExportQualityPreset.DRAFT,
    label: translate('videoEditor.exportDialog.qualityDraft'),
  },
  {
    value: VideoExportQualityPreset.BALANCED,
    label: translate('videoEditor.exportDialog.qualityBalanced'),
  },
  {
    value: VideoExportQualityPreset.HIGH,
    label: translate('videoEditor.exportDialog.qualityHigh'),
  },
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

function ExportDialogCodecField(props: {
  codecOptions: Array<{ label: string; value: VideoMp4Codec }>;
  currentCodec: VideoMp4Codec;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
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
          onChange={(mp4VideoCodec) => props.onChange({ mp4VideoCodec })}
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
}): Partial<VideoProjectExportSettings> {
  if (args.format !== VideoExportFormat.MP4 || args.settings.mp4VideoCodec !== undefined) {
    return { format: args.format };
  }

  return {
    format: args.format,
    ...(args.capabilities?.defaultMp4VideoCodec
      ? { mp4VideoCodec: args.capabilities.defaultMp4VideoCodec }
      : {}),
  };
}

export function ExportDialogSelectFields(params: {
  capabilities: VideoExportCapabilities | null | undefined;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
  selectedClipAvailable: boolean;
  settings: VideoProjectExportSettings;
}) {
  const { capabilities, onChange, selectedClipAvailable, settings } = params;
  const scopeOptions = getExportScopeOptions(selectedClipAvailable);
  const currentScope = settings.scope ?? VideoExportScope.PROJECT;
  const formatOptions = getExportFormatOptions(capabilities);
  const codecOptions = capabilities ? getMp4CodecOptions(capabilities) : [];
  const currentCodec = settings.mp4VideoCodec ?? codecOptions[0]?.value ?? VideoMp4Codec.AVC;

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
          onChange={onChange}
        />
      ) : null}
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
