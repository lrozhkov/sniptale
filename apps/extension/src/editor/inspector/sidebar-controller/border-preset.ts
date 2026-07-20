import type { EditorShapeSettings } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { DEFAULT_BORDER_PRESET } from '../../../composition/persistence/highlighter';
import type { BorderPreset } from '../../../features/highlighter/contracts';

function clampPercentUnit(value: number | undefined, fallback: number): number {
  const unit = typeof value === 'number' ? value : fallback;
  return Math.round(Math.min(1, Math.max(0, unit)) * 100);
}

function createRectanglePresetName(borderPresets: BorderPreset[]): string {
  const baseName = translate('editor.tools.rectangle');
  let index = 1;
  const presetNames = new Set(borderPresets.map((preset) => preset.name));

  while (presetNames.has(`${baseName} ${index}`)) {
    index++;
  }

  return `${baseName} ${index}`;
}

export function createBorderPresetFromShapeSettings(
  shapeSettings: EditorShapeSettings,
  borderPresets: BorderPreset[]
): BorderPreset {
  const sourcePreset = borderPresets.find((preset) => preset.id === shapeSettings.borderPresetId);
  const strokeOpacity = clampPercentUnit(shapeSettings.strokeOpacity, shapeSettings.opacity);
  const order =
    borderPresets.reduce((maxOrder, preset) => Math.max(maxOrder, preset.order), -1) + 1;

  return {
    id: crypto.randomUUID(),
    name: createRectanglePresetName(borderPresets),
    order,
    enabled: true,
    width: Math.max(1, Math.round(shapeSettings.strokeWidth)),
    color: shapeSettings.strokeColor,
    style: shapeSettings.strokeStyle,
    radius: Math.max(0, Math.round(shapeSettings.radius)),
    padding: { ...(sourcePreset?.padding ?? DEFAULT_BORDER_PRESET.padding) },
    shadow: shapeSettings.shadow,
    opacity: strokeOpacity,
    strokeOpacity,
    fillColor: shapeSettings.fillColor,
    fillOpacity: clampPercentUnit(shapeSettings.fillOpacity, shapeSettings.opacity),
    inheritCustomCss: false,
    customCss: '',
  };
}
