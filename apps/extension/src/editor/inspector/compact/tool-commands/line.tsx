import { translate } from '../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import { NumericRow } from '../../../chrome/ui';
import { TablerColorIcon } from '../color-icon';
import { buildLineFillCommand } from './line-fill';
import {
  LineCornerSelector,
  LineCornerTrigger,
  LineStyleSelector,
  LineStyleTrigger,
} from './line-options';
import { buildRangeCompactCommand, buildToolColorCompactCommand } from './shared';
import { buildShadowCompactCommand } from './shadow';
import type { LineCommandParams } from './line-types';
import type { ToolCommandParams } from './types';

type LineSettings = LineCommandParams['inspectorToolSettings']['line'];

function lineOptionLabel<TValue extends string>(
  options: readonly { label: string; value: TValue }[],
  value: TValue
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function buildLineWidthCommand(params: LineCommandParams, settings: LineSettings): CompactCommand {
  const label = translate('editor.compact.lineWidth');
  const value = `${settings.width}${translate('editor.compact.unitPx')}`;

  return {
    id: 'line-width',
    icon: 'size',
    title: label,
    trigger: (
      <CompactCommandToken className="min-w-8 text-center normal-case tracking-normal">
        {value}
      </CompactCommandToken>
    ),
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <NumericRow
          label={label}
          value={settings.width}
          unit="px"
          min={1}
          max={48}
          onPreviewValue={(width) => params.previewLinePatch({ width })}
          onCommitValue={(width) => {
            params.previewLinePatch({ width });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 1, max: 48 }}
        />
      </CompactCommandField>
    ),
  };
}

function buildLineRoughnessCommand(params: LineCommandParams, settings: LineSettings) {
  const label = translate('editor.compact.roughness');

  return buildRangeCompactCommand({
    id: 'line-roughness',
    icon: 'size',
    label,
    token: 'SM',
    value: settings.roughness,
    valueText: String(settings.roughness),
    min: 0,
    max: 3,
    step: 0.1,
    onChange: (value) =>
      params.previewLinePatch({ roughness: params.toNumber(value, settings.roughness) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildLineBowingCommand(params: LineCommandParams, settings: LineSettings) {
  const label = translate('editor.compact.bowing');
  const value = settings.bowing ?? 0;

  return buildRangeCompactCommand({
    id: 'line-bowing',
    icon: 'size',
    label,
    token: 'SM',
    value,
    valueText: String(value),
    min: 0,
    max: 3,
    step: 0.1,
    onChange: (rawValue) => params.previewLinePatch({ bowing: params.toNumber(rawValue, value) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildLineColorCommand(params: LineCommandParams, settings: LineSettings): CompactCommand {
  return {
    ...buildToolColorCompactCommand({
      id: 'line-color',
      fieldLabel: translate('editor.compact.lineColor'),
      title: translate('editor.compact.lineColor'),
      value: settings.color,
      params,
      onChange: (color) =>
        params.updateColor((next) => params.applyLinePatch({ color: next }), color),
      onPreviewChange: (color) =>
        params.previewColor((next) => params.applyLinePatch({ color: next }), color),
      onPreviewReset: (color) =>
        params.previewColor((next) => params.applyLinePatch({ color: next }), color),
    }),
    preservePopoverLabel: true,
  };
}

function buildLineOpacityCommand(
  params: LineCommandParams,
  settings: LineSettings
): CompactCommand {
  const label = translate('editor.compact.opacity');
  const percent = Math.round(settings.opacity * 100);

  return buildRangeCompactCommand({
    id: 'line-opacity',
    icon: 'opacity',
    label,
    token: 'OP',
    value: percent,
    valueText: `${percent}%`,
    min: 0,
    max: 100,
    onChange: (value) =>
      params.previewLinePatch({ opacity: params.toNumber(value, percent) / 100 }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildLineStyleCommand(params: LineCommandParams, settings: LineSettings): CompactCommand {
  const label = translate('editor.compact.lineStyle');
  const fieldLabel = translate('editor.compact.lineType');
  const value = lineOptionLabel(params.lineStyleOptions, settings.style);

  return {
    id: 'line-style',
    icon: 'trajectory',
    title: label,
    trigger: <LineStyleTrigger value={settings.style} />,
    value,
    preservePopoverLabel: true,
    content: (
      <CompactCommandField label={fieldLabel} value={value}>
        <LineStyleSelector
          ariaLabel={fieldLabel}
          value={settings.style}
          onChange={(style) => params.applyLinePatch({ style })}
          options={params.lineStyleOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildLineCornerCommand(params: LineCommandParams, settings: LineSettings): CompactCommand {
  const label = translate('editor.compact.lineCorners');
  const value = lineOptionLabel(params.lineCornerOptions, settings.corners);

  return {
    id: 'line-corners',
    icon: 'trajectory',
    title: label,
    trigger: <LineCornerTrigger value={settings.corners} />,
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <LineCornerSelector
          ariaLabel={label}
          value={settings.corners}
          onChange={(corners) => params.applyLinePatch({ corners })}
          options={params.lineCornerOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildLineShadowCommand(params: LineCommandParams, settings: LineSettings): CompactCommand {
  return buildShadowCompactCommand({
    id: 'line-shadow',
    fallbackColor: settings.color,
    params,
    palette: params.shapeStrokePalette,
    settings,
    trigger: (
      <TablerColorIcon
        color={settings.shadowColor ?? settings.color}
        icon={settings.shadow > 0 ? 'tabler:shadow' : 'tabler:shadow-off'}
        opacity={settings.shadow > 0 ? 1 : 0.65}
        showUnderline={settings.shadow > 0}
      />
    ),
    applyPatch: params.applyLinePatch,
    previewPatch: params.previewLinePatch,
  });
}

export function buildLineCompactCommands(params: ToolCommandParams): CompactCommand[] {
  if (!params.applyLinePatch || !params.previewLinePatch) {
    return [];
  }

  const lineParams: LineCommandParams = {
    ...params,
    applyLinePatch: params.applyLinePatch,
    previewLinePatch: params.previewLinePatch,
  };
  const settings = lineParams.inspectorToolSettings.line;

  return [
    buildLineWidthCommand(lineParams, settings),
    buildLineRoughnessCommand(lineParams, settings),
    buildLineBowingCommand(lineParams, settings),
    buildLineColorCommand(lineParams, settings),
    buildLineOpacityCommand(lineParams, settings),
    buildLineStyleCommand(lineParams, settings),
    buildLineCornerCommand(lineParams, settings),
    buildLineFillCommand(lineParams, settings),
    buildLineShadowCommand(lineParams, settings),
  ];
}
