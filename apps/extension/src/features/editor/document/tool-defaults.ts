import type { BorderPreset } from '../../highlighter/contracts';
import { createDefaultDrawingToolDefaults } from '../../drawing/public';
import type { EditorToolSettings } from './tool-settings-types';
import { projectBorderPresetToEditorShapeSettings } from './highlighter-projection';
import { DEFAULT_EDITOR_IMAGE_SETTINGS, type EditorImageSettings } from './image-types';

function createDefaultStepSettings(strokeColor: string) {
  return {
    type: 'number' as const,
    alphabet: 'cyrillic' as const,
    sizeLevel: 3 as const,
    value: '1',
    color: strokeColor,
    opacity: 1,
    textColor: '#ffffff',
    strokeColor: '#f8fafc',
    strokeOpacity: 1,
    strokeWidth: 2,
  };
}

function createDefaultImageSettings(borderPreset: BorderPreset): EditorImageSettings {
  const shapeSettings = projectBorderPresetToEditorShapeSettings(borderPreset);

  return {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    borderPresetId: shapeSettings.borderPresetId,
    radius: shapeSettings.radius,
    shadow: shapeSettings.shadow,
    shadowAngle: shapeSettings.shadowAngle ?? 90,
    shadowBlur: shapeSettings.shadowBlur ?? 12,
    shadowColor: shapeSettings.strokeColor,
    shadowDistance: shapeSettings.shadowDistance ?? 4,
    strokeColor: shapeSettings.strokeColor,
    strokeOpacity: shapeSettings.strokeOpacity,
    strokeStyle: shapeSettings.strokeStyle,
  };
}

export const DEFAULT_EDITOR_TOOL_SETTINGS = (borderPreset: BorderPreset): EditorToolSettings => {
  const defaultRectangleSettings = projectBorderPresetToEditorShapeSettings(borderPreset);
  const defaultImageSettings = createDefaultImageSettings(borderPreset);

  return {
    ...createDefaultDrawingToolDefaults(),
    step: createDefaultStepSettings(defaultRectangleSettings.strokeColor),
    image: defaultImageSettings,
  };
};
