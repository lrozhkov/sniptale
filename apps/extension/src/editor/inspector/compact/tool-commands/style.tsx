import { translate } from '../../../../platform/i18n';
import { type CompactCommand } from '..';
import type { ToolCommandParams } from './types';
import { buildShadowCompactCommand } from './shadow';
import { buildRangeCompactCommand, buildToolColorCompactCommand } from './shared';
import { TablerColorIcon } from '../color-icon';
export { buildShapeCompactCommands } from './shape';

function buildBrushColorCommand(
  params: ToolCommandParams,
  tool: 'pencil' | 'highlighter'
): CompactCommand {
  const settings = params.inspectorToolSettings[tool];
  const colorLabel = translate('editor.compact.lineColor');

  return buildToolColorCompactCommand({
    id: `${tool}-color`,
    title: colorLabel,
    value: settings.color,
    params,
    opacity: settings.opacity,
    onChange: (color) =>
      params.updateColor((next) => params.applyBrushPatch(tool, { color: next }), color),
    onPreviewChange: (color) =>
      params.previewColor((next) => params.applyBrushPatch(tool, { color: next }), color),
    onPreviewReset: (color) =>
      params.previewColor((next) => params.applyBrushPatch(tool, { color: next }), color),
  });
}

function buildBrushWidthCommand(
  params: ToolCommandParams,
  tool: 'pencil' | 'highlighter'
): CompactCommand {
  const settings = params.inspectorToolSettings[tool];
  const widthLabel = translate('editor.compact.lineWidth');
  const widthValue = `${settings.width}${translate('editor.compact.unitPx')}`;

  return {
    ...buildRangeCompactCommand({
      id: `${tool}-width`,
      icon: 'size',
      label: widthLabel,
      token: 'PX',
      value: settings.width,
      valueText: widthValue,
      min: 1,
      max: tool === 'highlighter' ? 48 : 20,
      onChange: (rawValue) =>
        params.previewBrushPatch(tool, {
          width: params.toNumber(rawValue, settings.width),
        }),
      onValueCommit: params.commitPendingSelectionSettings,
    }),
    trigger: (
      <span className="min-w-8 text-center text-xs font-semibold tracking-normal text-current">
        {widthValue}
      </span>
    ),
  };
}

function buildBrushOpacityCommand(
  params: ToolCommandParams,
  tool: 'pencil' | 'highlighter'
): CompactCommand {
  const settings = params.inspectorToolSettings[tool];
  const opacityLabel = translate('editor.compact.opacity');

  return buildRangeCompactCommand({
    id: `${tool}-opacity`,
    icon: 'opacity',
    label: opacityLabel,
    token: 'OP',
    value: settings.opacity,
    valueText: `${Math.round(settings.opacity * 100)}%`,
    min: 0.05,
    max: 1,
    step: 0.05,
    onChange: (rawValue) => params.previewBrushPatch(tool, { opacity: Number(rawValue) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildBrushSmoothingCommand(
  params: ToolCommandParams,
  tool: 'pencil' | 'highlighter'
): CompactCommand {
  const settings = params.inspectorToolSettings[tool];
  const smoothingLabel = translate('editor.compact.smoothingLevel');
  const enabled = settings.smoothingLevel > 0;
  const valueText = translate(
    enabled ? 'editor.compact.enabledShort' : 'editor.compact.disabledShort'
  );

  return {
    id: `${tool}-smoothing`,
    title: smoothingLabel,
    trigger: null,
    value: valueText,
    active: enabled,
    onClick: () => params.applyBrushPatch(tool, { smoothingLevel: enabled ? 0 : 10 }),
  };
}

function buildBrushDynamicWidthCommand(params: ToolCommandParams): CompactCommand {
  const label = translate('editor.compact.dynamicWidth');
  const enabled = params.inspectorToolSettings.pencil.dynamicWidth !== false;
  const valueText = translate(
    enabled ? 'editor.compact.enabledShort' : 'editor.compact.disabledShort'
  );

  return {
    id: 'pencil-dynamic-width',
    title: label,
    trigger: null,
    value: valueText,
    active: enabled,
    onClick: () => params.applyBrushPatch('pencil', { dynamicWidth: !enabled }),
  };
}

function buildPencilShadowCommand(params: ToolCommandParams): CompactCommand {
  const settings = params.inspectorToolSettings.pencil;

  return buildShadowCompactCommand({
    id: 'pencil-shadow',
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
    applyPatch: (patch) => params.applyBrushPatch('pencil', patch),
    previewPatch: (patch) => params.previewBrushPatch('pencil', patch),
  });
}

export function buildBrushCompactCommands(
  params: ToolCommandParams,
  tool: 'pencil' | 'highlighter'
): CompactCommand[] {
  return [
    buildBrushColorCommand(params, tool),
    buildBrushWidthCommand(params, tool),
    ...(tool === 'pencil' ? [buildBrushDynamicWidthCommand(params)] : []),
    buildBrushSmoothingCommand(params, tool),
    buildBrushOpacityCommand(params, tool),
    ...(tool === 'pencil' ? [buildPencilShadowCommand(params)] : []),
  ];
}
