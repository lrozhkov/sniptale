import { translate } from '../../../../platform/i18n';
import {
  EDITOR_TOOL_SHAPE_FILL_PALETTE,
  EDITOR_TOOL_SHAPE_STROKE_PALETTE,
} from '../../../../features/editor/document/constants';
import { getEditorShapeSettings } from '../../../../features/editor/document/shape-settings';
import { type EditorShapeSettings } from '../../../../features/editor/document/types';
import {
  CompactCommandField,
  CompactCommandToken,
  CompactLineTrigger,
  type CompactCommand,
} from '..';
import type { ToolCommandParams } from './types';
import { ColorField, NumericRow, SelectField } from '../../../chrome/ui';
import { createEditorColorPatchHandlers } from '../../tools/color-actions';
import { TablerColorIcon } from '../color-icon';
import { TablerIcon } from '../tabler-icon';
import { buildShadowCompactCommand } from './shadow';
import { ShapeStrokeStyleSelector, ShapeStrokeStyleTrigger } from './shape-options';
import { resolveShapeTool } from './shape-tool';

function buildShapePresetCommand(
  params: ToolCommandParams,
  settings: EditorShapeSettings,
  presetLabel: string
): CompactCommand {
  return {
    id: 'shape-preset',
    icon: 'preset',
    title: translate('editor.compact.shapePreset'),
    trigger: <TablerIcon icon="tabler:border-outer" />,
    value: presetLabel,
    preservePopoverLabel: true,
    content: (
      <CompactCommandField label={translate('editor.compact.shapePreset')} value={presetLabel}>
        <SelectField
          label={translate('editor.compact.shapePreset')}
          value={settings.borderPresetId ?? ''}
          onChange={params.applyPreset}
          options={params.borderPresetOptions}
          menuClassName="w-[15rem]"
        />
      </CompactCommandField>
    ),
  };
}

function resolveShapeColorTriggerIcon(
  settings: EditorShapeSettings,
  field: 'strokeColor' | 'fillColor'
) {
  if (field === 'strokeColor') {
    return 'tabler:palette';
  }

  return settings.fillOpacity <= 0 ? 'tabler:bucket-off' : 'tabler:bucket';
}

function buildShapeColorCommand(
  params: ToolCommandParams,
  field: 'strokeColor' | 'fillColor'
): CompactCommand {
  const settings = getEditorShapeSettings(params.inspectorToolSettings, resolveShapeTool(params));
  const titleKey =
    field === 'strokeColor' ? 'editor.compact.strokeColor' : 'editor.compact.fillColor';
  const label = translate(titleKey);
  const colorHandlers = createEditorColorPatchHandlers({
    applyPatch: params.applyShapePatch,
    createPatch: (color: string) => ({ [field]: color }) as Partial<EditorShapeSettings>,
    previewColor: params.previewColor,
    updateColor: params.updateColor,
  });

  return {
    id: `shape-${field === 'strokeColor' ? 'stroke' : 'fill'}-color`,
    icon: 'color',
    title: translate(titleKey),
    trigger: (
      <TablerColorIcon
        color={settings[field]}
        icon={resolveShapeColorTriggerIcon(settings, field)}
        opacity={field === 'strokeColor' ? settings.strokeOpacity : settings.fillOpacity}
      />
    ),
    value: settings[field],
    preservePopoverLabel: true,
    content: (
      <CompactCommandField label={label} value={settings[field]}>
        <ColorField
          title={label}
          label={label}
          value={settings[field]}
          recentColors={params.recentColors}
          palette={
            field === 'strokeColor'
              ? EDITOR_TOOL_SHAPE_STROKE_PALETTE
              : EDITOR_TOOL_SHAPE_FILL_PALETTE
          }
          {...colorHandlers}
        />
      </CompactCommandField>
    ),
  };
}

function buildShapeStrokeWidthCommand(
  params: ToolCommandParams,
  settings: EditorShapeSettings
): CompactCommand {
  return {
    id: 'shape-stroke-width',
    icon: 'size',
    title: translate('editor.compact.strokeWidth'),
    trigger: <CompactLineTrigger color={settings.strokeColor} width={settings.strokeWidth} />,
    value: `${settings.strokeWidth}px`,
    content: (
      <CompactCommandField
        label={translate('editor.compact.strokeWidth')}
        value={`${settings.strokeWidth}px`}
      >
        <NumericRow
          label={translate('editor.compact.strokeWidth')}
          value={settings.strokeWidth}
          unit="px"
          min={1}
          max={24}
          onPreviewValue={(strokeWidth) => params.previewShapePatch({ strokeWidth })}
          onCommitValue={(strokeWidth) => {
            params.previewShapePatch({ strokeWidth });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 1, max: 24 }}
        />
      </CompactCommandField>
    ),
  };
}

function buildShapeStrokeStyleCommand(
  params: ToolCommandParams,
  settings: EditorShapeSettings
): CompactCommand {
  const label = translate('editor.compact.lineStyle');
  const fieldLabel = translate('editor.compact.lineType');
  const options = [
    { label: translate('editor.compact.lineStyleSolid'), value: 'solid' },
    { label: translate('editor.compact.lineStyleDash'), value: 'dashed' },
    { label: translate('editor.compact.lineStyleDot'), value: 'dotted' },
  ] satisfies Array<{ label: string; value: EditorShapeSettings['strokeStyle'] }>;

  return {
    id: 'shape-stroke-style',
    icon: 'trajectory',
    title: label,
    trigger: <ShapeStrokeStyleTrigger value={settings.strokeStyle} />,
    value: settings.strokeStyle,
    preservePopoverLabel: true,
    content: (
      <CompactCommandField label={fieldLabel} value={settings.strokeStyle}>
        <ShapeStrokeStyleSelector
          ariaLabel={fieldLabel}
          value={settings.strokeStyle}
          onChange={(strokeStyle) => params.applyShapePatch({ strokeStyle })}
          options={options}
        />
      </CompactCommandField>
    ),
  };
}

function buildShapeRadiusCommand(
  params: ToolCommandParams,
  settings: EditorShapeSettings
): CompactCommand | null {
  if (resolveShapeTool(params) !== 'rectangle') {
    return null;
  }

  return {
    id: 'shape-radius',
    icon: 'size',
    title: translate('editor.compact.cornerRadius'),
    trigger: <CompactCommandToken>RAD</CompactCommandToken>,
    value: `${settings.radius}px`,
    preservePopoverLabel: true,
    content: (
      <CompactCommandField
        label={translate('editor.compact.cornerRadius')}
        value={`${settings.radius}px`}
      >
        <NumericRow
          label={translate('editor.compact.cornerRadius')}
          value={settings.radius}
          unit="px"
          min={0}
          max={48}
          onPreviewValue={(radius) => params.previewShapePatch({ radius })}
          onCommitValue={(radius) => {
            params.previewShapePatch({ radius });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 0, max: 48 }}
        />
      </CompactCommandField>
    ),
  };
}

function buildShapeShadowCommand(
  params: ToolCommandParams,
  settings: EditorShapeSettings
): CompactCommand {
  return buildShadowCompactCommand({
    id: 'shape-shadow',
    icon: 'opacity',
    fallbackColor: settings.strokeColor,
    params,
    palette: params.shapeStrokePalette,
    settings,
    trigger: (
      <TablerColorIcon
        color={settings.shadowColor ?? settings.strokeColor}
        icon={settings.shadow > 0 ? 'tabler:shadow' : 'tabler:shadow-off'}
        opacity={settings.shadow > 0 ? 1 : 0.65}
        showUnderline={settings.shadow > 0}
      />
    ),
    applyPatch: params.applyShapePatch,
    previewPatch: params.previewShapePatch,
  });
}

function buildShapeOpacityCommand(
  params: ToolCommandParams,
  settings: EditorShapeSettings,
  field: 'strokeOpacity' | 'fillOpacity'
): CompactCommand {
  const labelKey =
    field === 'strokeOpacity'
      ? 'highlighter.editor.strokeOpacityLabel'
      : 'highlighter.editor.fillOpacityLabel';
  const label = translate(labelKey);
  const valueText = `${Math.round(settings[field] * 100)}%`;

  return {
    id: field === 'strokeOpacity' ? 'shape-stroke-opacity' : 'shape-fill-opacity',
    icon: 'opacity',
    title: label,
    trigger: <CompactCommandToken>OP</CompactCommandToken>,
    value: valueText,
    content: (
      <CompactCommandField label={label} value={valueText}>
        <NumericRow
          label={label}
          value={Math.round(settings[field] * 100)}
          unit="%"
          min={0}
          max={100}
          step={5}
          onPreviewValue={(value) => params.previewShapePatch({ [field]: value / 100 })}
          onCommitValue={(value) => {
            params.previewShapePatch({ [field]: value / 100 });
            params.commitPendingSelectionSettings();
          }}
          scrub={{ min: 0, max: 100, step: 5 }}
        />
      </CompactCommandField>
    ),
  };
}

export function buildShapeCompactCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = getEditorShapeSettings(params.inspectorToolSettings, resolveShapeTool(params));
  const presetLabel = settings.borderPresetId
    ? (params.borderPresets.find((item) => item.id === settings.borderPresetId)?.name ??
      translate('editor.compact.shapePresetFallback'))
    : translate('editor.compact.notSelected');

  return [
    buildShapePresetCommand(params, settings, presetLabel),
    buildShapeColorCommand(params, 'strokeColor'),
    buildShapeColorCommand(params, 'fillColor'),
    buildShapeStrokeWidthCommand(params, settings),
    buildShapeStrokeStyleCommand(params, settings),
    buildShapeRadiusCommand(params, settings),
    buildShapeShadowCommand(params, settings),
    buildShapeOpacityCommand(params, settings, 'strokeOpacity'),
    buildShapeOpacityCommand(params, settings, 'fillOpacity'),
  ].filter((command): command is CompactCommand => command !== null);
}
