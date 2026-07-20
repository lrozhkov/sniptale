import { translate } from '../../../../platform/i18n';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../../features/editor/document/constants';
import { type EditorImageSettings } from '../../../../features/editor/document/image-types';
import { EDITOR_TOOL_SHAPE_STROKE_PALETTE } from '../../../../features/editor/document/constants';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import { TablerColorIcon } from '../color-icon';
import { TablerIcon } from '../tabler-icon';
import { ColorField, SelectField } from '../../../chrome/ui';
import { createEditorColorPatchHandlers } from '../../tools/color-actions';
import { buildShadowCompactCommand } from './shadow';
import { buildRangeCompactCommand } from './shared';
import type { ToolCommandParams } from './types';

function applyImagePatch(params: ToolCommandParams, patch: Partial<EditorImageSettings>): void {
  params.applyImagePatch?.(patch);
}

function previewImagePatch(params: ToolCommandParams, patch: Partial<EditorImageSettings>): void {
  params.previewImagePatch?.(patch);
}

function buildImageOpacityCommand(
  params: ToolCommandParams,
  settings: EditorImageSettings
): CompactCommand {
  return buildRangeCompactCommand({
    id: 'image-opacity',
    icon: 'opacity',
    label: translate('editor.compact.opacity'),
    token: 'OP',
    trigger: <TablerIcon icon="tabler:layers-intersect-2" />,
    value: settings.opacity,
    valueText: `${Math.round(settings.opacity * 100)}%`,
    min: 0,
    max: 1,
    step: 0.05,
    onChange: (rawValue) => previewImagePatch(params, { opacity: Number(rawValue) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildImageRadiusCommand(
  params: ToolCommandParams,
  settings: EditorImageSettings
): CompactCommand {
  return buildRangeCompactCommand({
    id: 'image-radius',
    icon: 'size',
    label: translate('editor.compact.cornerRadius'),
    token: 'RAD',
    trigger: <TablerIcon icon="tabler:border-corner-square" />,
    value: settings.radius,
    valueText: `${settings.radius}px`,
    min: 0,
    max: 80,
    onChange: (rawValue) =>
      previewImagePatch(params, { radius: params.toNumber(rawValue, settings.radius) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildImageShadowCommand(
  params: ToolCommandParams,
  settings: EditorImageSettings
): CompactCommand {
  const shadowColor =
    settings.shadowColor ?? DEFAULT_EDITOR_IMAGE_SETTINGS.shadowColor ?? '#475569';

  return buildShadowCompactCommand({
    id: 'image-shadow',
    fallbackColor: shadowColor,
    params,
    palette: params.shapeStrokePalette,
    settings,
    trigger: (
      <TablerColorIcon
        color={shadowColor}
        icon={settings.shadow > 0 ? 'tabler:shadow' : 'tabler:shadow-off'}
        opacity={settings.shadow > 0 ? 1 : 0.65}
        showUnderline={settings.shadow > 0}
      />
    ),
    applyPatch: (patch) => applyImagePatch(params, patch),
    previewPatch: (patch) => previewImagePatch(params, patch),
  });
}

function buildImageStrokeWidthCommand(
  params: ToolCommandParams,
  settings: EditorImageSettings
): CompactCommand {
  return buildRangeCompactCommand({
    id: 'image-stroke-width',
    icon: 'size',
    label: translate('editor.compact.blurStrokeWidth'),
    token: 'PX',
    value: settings.strokeWidth,
    valueText: `${settings.strokeWidth}px`,
    min: 0,
    max: 24,
    onChange: (rawValue) =>
      previewImagePatch(params, {
        strokeWidth: params.toNumber(rawValue, settings.strokeWidth),
      }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

function buildImageStrokeStyleCommand(
  params: ToolCommandParams,
  settings: EditorImageSettings
): CompactCommand {
  const label = translate('highlighter.editor.styleLabel');
  const value =
    params.lineStyleOptions.find((option) => option.value === settings.strokeStyle)?.label ??
    settings.strokeStyle;

  return {
    id: 'image-stroke-style',
    icon: 'trajectory',
    title: label,
    trigger: <CompactCommandToken>STY</CompactCommandToken>,
    value,
    content: (
      <CompactCommandField label={label} value={value}>
        <SelectField
          label={label}
          value={settings.strokeStyle}
          onChange={(strokeStyle: EditorImageSettings['strokeStyle']) =>
            applyImagePatch(params, { strokeStyle })
          }
          options={params.lineStyleOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildImageStrokeColorCommand(
  params: ToolCommandParams,
  settings: EditorImageSettings
): CompactCommand {
  const label = translate('editor.compact.color');
  const colorHandlers = createEditorColorPatchHandlers({
    applyPatch: (patch) => applyImagePatch(params, patch),
    createPatch: (strokeColor: string) => ({ strokeColor }),
    previewColor: params.previewColor,
    updateColor: params.updateColor,
  });

  return {
    id: 'image-stroke-color',
    icon: 'color',
    title: label,
    trigger: (
      <TablerColorIcon
        color={settings.strokeColor}
        icon="tabler:palette"
        opacity={settings.strokeOpacity}
      />
    ),
    value: settings.strokeColor,
    preservePopoverLabel: true,
    content: (
      <CompactCommandField label={label} value={settings.strokeColor}>
        <ColorField
          title={label}
          label={label}
          value={settings.strokeColor}
          recentColors={params.recentColors}
          palette={EDITOR_TOOL_SHAPE_STROKE_PALETTE}
          {...colorHandlers}
        />
      </CompactCommandField>
    ),
  };
}

function buildImageStrokeOpacityCommand(
  params: ToolCommandParams,
  settings: EditorImageSettings
): CompactCommand {
  return buildRangeCompactCommand({
    id: 'image-stroke-opacity',
    icon: 'opacity',
    label: translate('editor.compact.opacity'),
    token: 'OP',
    value: settings.strokeOpacity,
    valueText: `${Math.round(settings.strokeOpacity * 100)}%`,
    min: 0,
    max: 1,
    step: 0.05,
    onChange: (rawValue) => previewImagePatch(params, { strokeOpacity: Number(rawValue) }),
    onValueCommit: params.commitPendingSelectionSettings,
  });
}

export function buildImageCompactCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = params.inspectorToolSettings.image;

  return [
    buildImageOpacityCommand(params, settings),
    buildImageRadiusCommand(params, settings),
    buildImageShadowCommand(params, settings),
    buildImageStrokeWidthCommand(params, settings),
    buildImageStrokeStyleCommand(params, settings),
    buildImageStrokeColorCommand(params, settings),
    buildImageStrokeOpacityCommand(params, settings),
  ];
}
