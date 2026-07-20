import { translate } from '../../../../platform/i18n';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import { NumericRow, SelectField } from '../../../chrome/ui';
import { resolveBlurBorderSettings } from '../../tools/blur-shared';
import type { ToolCommandParams } from './types';
import { buildRangeCompactCommand, buildToolColorCompactCommand } from './shared';

function buildBlurAmountCommand(params: ToolCommandParams): CompactCommand {
  const settings = params.inspectorToolSettings.blur;
  const label = translate('editor.compact.blurAmount');

  return {
    id: 'blur-amount',
    icon: 'opacity',
    title: label,
    trigger: <CompactCommandToken>AMT</CompactCommandToken>,
    value: String(settings.amount),
    content: (
      <CompactCommandField label={label} value={String(settings.amount)}>
        <NumericRow
          label={label}
          value={settings.amount}
          unit="px"
          min={1}
          max={24}
          step={1}
          onPreviewValue={(amount) => params.previewBlurPatch({ amount })}
          onCommitValue={(amount) => {
            params.previewBlurPatch({ amount });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 1, max: 24, step: 1 }}
        />
      </CompactCommandField>
    ),
  };
}

function buildBlurTypeCommand(params: ToolCommandParams): CompactCommand {
  const settings = params.inspectorToolSettings.blur;
  const label = translate('editor.compact.blurEffect');
  const value =
    params.blurTypeOptions.find((option) => option.value === settings.blurType)?.label ??
    settings.blurType;

  return {
    id: 'blur-type',
    icon: 'opacity',
    title: label,
    trigger: <CompactCommandToken>TYP</CompactCommandToken>,
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <SelectField
          label={label}
          value={settings.blurType}
          onChange={(blurType) => params.applyBlurPatch({ blurType })}
          options={params.blurTypeOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildBlurStrokeColorCommand(params: ToolCommandParams, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  const label = translate('editor.compact.color');

  return buildToolColorCompactCommand({
    id: 'blur-stroke-color',
    fieldLabel: label,
    title: label,
    value: borderSettings.strokeColor,
    params,
    onChange: (color) =>
      params.updateColor((next) => params.applyBlurPatch({ strokeColor: next }), color),
    onPreviewChange: (color) =>
      params.previewColor((next) => params.applyBlurPatch({ strokeColor: next }), color),
    onPreviewReset: (color) =>
      params.previewColor((next) => params.applyBlurPatch({ strokeColor: next }), color),
  });
}

function buildBlurStrokeWidthCommand(params: ToolCommandParams, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  return buildRangeCompactCommand({
    id: 'blur-stroke-width',
    icon: 'size',
    label: translate('editor.compact.blurStrokeWidth'),
    token: 'PX',
    value: borderSettings.strokeWidth,
    valueText: `${borderSettings.strokeWidth}px`,
    min: 0,
    max: 24,
    onChange: (rawValue) => {
      const strokeWidth = params.toNumber(rawValue, borderSettings.strokeWidth);
      params.previewBlurPatch({ showBorder: strokeWidth > 0, strokeWidth });
    },
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildBlurRadiusCommand(params: ToolCommandParams, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  return buildRangeCompactCommand({
    id: 'blur-radius',
    icon: 'size',
    label: translate('editor.compact.cornerRadius'),
    token: 'PX',
    value: borderSettings.radius,
    valueText: `${borderSettings.radius}px`,
    min: 0,
    max: 50,
    onChange: (rawValue) =>
      params.previewBlurPatch({ radius: params.toNumber(rawValue, borderSettings.radius) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildBlurStrokeStyleCommand(
  params: ToolCommandParams,
  settings: BlurSettings
): CompactCommand {
  const borderSettings = resolveBlurBorderSettings(settings);
  const label = translate('highlighter.editor.styleLabel');
  const value =
    params.lineStyleOptions.find((option) => option.value === borderSettings.strokeStyle)?.label ??
    borderSettings.strokeStyle;

  return {
    id: 'blur-stroke-style',
    icon: 'trajectory',
    title: label,
    trigger: <CompactCommandToken>STY</CompactCommandToken>,
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <SelectField
          label={label}
          value={borderSettings.strokeStyle}
          onChange={(strokeStyle) => params.applyBlurPatch({ strokeStyle })}
          options={params.lineStyleOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildBlurStrokeOpacityCommand(params: ToolCommandParams, settings: BlurSettings) {
  const borderSettings = resolveBlurBorderSettings(settings);
  return buildRangeCompactCommand({
    id: 'blur-stroke-opacity',
    icon: 'opacity',
    label: translate('editor.compact.opacity'),
    token: 'OP',
    value: borderSettings.strokeOpacity,
    valueText: `${Math.round(borderSettings.strokeOpacity * 100)}%`,
    min: 0,
    max: 1,
    step: 0.05,
    onChange: (rawValue) => params.previewBlurPatch({ strokeOpacity: Number(rawValue) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

export function buildBlurCompactCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = params.inspectorToolSettings.blur;
  return [
    buildBlurTypeCommand(params),
    buildBlurAmountCommand(params),
    buildBlurRadiusCommand(params, settings),
    buildBlurStrokeWidthCommand(params, settings),
    buildBlurStrokeStyleCommand(params, settings),
    buildBlurStrokeColorCommand(params, settings),
    buildBlurStrokeOpacityCommand(params, settings),
  ];
}
