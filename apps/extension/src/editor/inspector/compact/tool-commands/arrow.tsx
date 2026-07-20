import { translate } from '../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import { SelectField } from '../../../chrome/ui';
import type { ToolCommandParams } from './types';
import { TablerColorIcon } from '../color-icon';
import { buildArrowHeadCommand, buildArrowHeadSizeCommand } from './arrow-heads';
import { LineStyleSelector, LineStyleTrigger } from './line-options';
import { buildShadowCompactCommand } from './shadow';
import { buildRangeCompactCommand, buildToolColorCompactCommand } from './shared';

function buildArrowColorCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow']
): CompactCommand {
  const label = translate('editor.compact.arrowColor');

  return {
    ...buildToolColorCompactCommand({
      id: 'arrow-color',
      title: label,
      opacity: 1,
      value: settings.color,
      params,
      onChange: (color) =>
        params.updateColor((next) => params.applyArrowPatch({ color: next }), color),
      onPreviewChange: (color) =>
        params.previewColor((next) => params.applyArrowPatch({ color: next }), color),
      onPreviewReset: (color) =>
        params.previewColor((next) => params.applyArrowPatch({ color: next }), color),
    }),
    preservePopoverLabel: true,
  };
}

function buildArrowWidthCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow']
): CompactCommand {
  const valueText = `${settings.width}${translate('editor.compact.unitPx')}`;

  return {
    ...buildRangeCompactCommand({
      id: 'arrow-width',
      icon: 'size',
      label: translate('editor.compact.arrowWidth'),
      token: 'PX',
      value: settings.width,
      valueText,
      min: 1,
      max: 36,
      onChange: (rawValue) =>
        params.previewArrowPatch({
          width: params.toNumber(rawValue, settings.width),
        }),
      onValueCommit: params.commitPendingSelectionSettings,
    }),
    trigger: (
      <CompactCommandToken className="min-w-8 text-center normal-case tracking-normal">
        {valueText}
      </CompactCommandToken>
    ),
  };
}

function buildArrowStyleCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow']
): CompactCommand {
  const label = translate('editor.compact.lineStyle');
  const fieldLabel = translate('editor.compact.lineType');
  const styleValue = settings.style ?? 'solid';
  const styleLabel =
    params.lineStyleOptions.find((item) => item.value === styleValue)?.label ?? styleValue;

  return {
    id: 'arrow-style',
    icon: 'size',
    title: label,
    trigger: <LineStyleTrigger value={styleValue} />,
    value: styleLabel,
    preservePopoverLabel: true,
    content: (
      <CompactCommandField label={fieldLabel} value={styleLabel}>
        <LineStyleSelector
          ariaLabel={fieldLabel}
          value={styleValue}
          onChange={(style) => params.applyArrowPatch({ style })}
          options={params.lineStyleOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildArrowRoughnessCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow']
): CompactCommand {
  const label = translate('editor.compact.roughness');
  const value = settings.roughness ?? 0;

  return buildRangeCompactCommand({
    id: 'arrow-roughness',
    icon: 'size',
    label,
    token: 'SM',
    value,
    valueText: String(value),
    min: 0,
    max: 3,
    step: 0.1,
    onChange: (rawValue) =>
      params.previewArrowPatch({
        roughness: params.toNumber(rawValue, value),
      }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildArrowBowingCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow']
): CompactCommand {
  const label = translate('editor.compact.bowing');
  const value = settings.bowing ?? 0;

  return buildRangeCompactCommand({
    id: 'arrow-bowing',
    icon: 'size',
    label,
    token: 'SM',
    value,
    valueText: String(value),
    min: 0,
    max: 3,
    step: 0.1,
    onChange: (rawValue) =>
      params.previewArrowPatch({
        bowing: params.toNumber(rawValue, value),
      }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildArrowTypeCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow'],
  typeLabel: string
): CompactCommand {
  return {
    id: 'arrow-type',
    icon: 'trajectory',
    title: translate('editor.compact.arrowType'),
    trigger: <CompactCommandToken>TYPE</CompactCommandToken>,
    value: typeLabel,
    content: (
      <CompactCommandField label={translate('editor.compact.arrowType')} value={typeLabel}>
        <SelectField
          label={translate('editor.compact.arrowType')}
          value={settings.arrowType ?? 'sharp'}
          onChange={(arrowType) =>
            params.applyArrowPatch({
              arrowType,
              mode: arrowType === 'curved' ? 'curve' : 'straight',
            })
          }
          options={params.arrowTypeOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildArrowDynamicWidthCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow']
): CompactCommand {
  const enabled = settings.dynamicWidth !== false;
  const label = translate('editor.compact.dynamicWidth');
  return {
    id: 'arrow-dynamic-width',
    icon: 'trajectory',
    title: label,
    trigger: <CompactCommandToken>DW</CompactCommandToken>,
    value: translate(enabled ? 'editor.compact.enabledShort' : 'editor.compact.disabledShort'),
    active: enabled,
    onClick: () =>
      params.applyArrowPatch({
        dynamicWidth: !enabled,
        variant: !enabled ? 'tapered' : 'standard',
      }),
  };
}

function buildArrowShadowCommand(
  params: ToolCommandParams,
  settings: ToolCommandParams['inspectorToolSettings']['arrow']
): CompactCommand {
  return buildShadowCompactCommand({
    id: 'arrow-shadow',
    icon: 'trajectory',
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
    applyPatch: params.applyArrowPatch,
    previewPatch: params.previewArrowPatch,
  });
}

export function buildArrowCompactCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = params.inspectorToolSettings.arrow;
  const typeValue = settings.arrowType ?? 'sharp';
  const typeLabel =
    params.arrowTypeOptions.find((item) => item.value === typeValue)?.label ?? typeValue;
  const startHeadLabel =
    params.arrowHeadOptions.find((item) => item.value === settings.startHead)?.label ??
    settings.startHead;
  const endHeadLabel =
    params.arrowHeadOptions.find((item) => item.value === settings.endHead)?.label ??
    settings.endHead;

  const commands: CompactCommand[] = [
    buildArrowColorCommand(params, settings),
    buildArrowTypeCommand(params, settings, typeLabel),
    buildArrowWidthCommand(params, settings),
    buildArrowStyleCommand(params, settings),
    buildArrowDynamicWidthCommand(params, settings),
    buildArrowRoughnessCommand(params, settings),
    buildArrowBowingCommand(params, settings),
    buildArrowShadowCommand(params, settings),
  ];

  if (settings.dynamicWidth === false) {
    commands.push(buildArrowHeadCommand(params, settings, 'startHead', startHeadLabel));
    commands.push(buildArrowHeadSizeCommand(params, settings, 'startHeadSize'));
    commands.push(buildArrowHeadCommand(params, settings, 'endHead', endHeadLabel));
    commands.push(buildArrowHeadSizeCommand(params, settings, 'endHeadSize'));
  }

  return commands;
}
