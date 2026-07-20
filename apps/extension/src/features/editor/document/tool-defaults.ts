import type { BorderPreset } from '../../highlighter/contracts';
import { DEFAULT_BLUR_SETTINGS } from '../../highlighter/style/public';
import type { EditorBrushSettings } from './types';
import type { EditorToolSettings } from './tool-settings-types';
import type { EditorLineSettings } from './line-types';
import { EDITOR_ARROW_HEAD_SIZE_DEFAULT } from './arrow';
import { DEFAULT_COLOR_ACCENT, DEFAULT_COLOR_WARNING } from '@sniptale/ui/default-colors/constants';
import { projectBorderPresetToEditorShapeSettings } from './highlighter-projection';
import { DEFAULT_EDITOR_IMAGE_SETTINGS, type EditorImageSettings } from './image-types';

function createDefaultArrowSettings() {
  return {
    color: DEFAULT_COLOR_ACCENT,
    width: 18,
    style: 'solid' as const,
    opacity: 1,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: DEFAULT_COLOR_ACCENT,
    shadowDistance: 4,
    variant: 'standard' as const,
    mode: 'straight' as const,
    arrowType: 'sharp' as const,
    dynamicWidth: false,
    roughness: 0,
    bowing: 0,
    startHead: 'none' as const,
    endHead: 'triangle' as const,
    startHeadSize: EDITOR_ARROW_HEAD_SIZE_DEFAULT,
    endHeadSize: EDITOR_ARROW_HEAD_SIZE_DEFAULT,
  };
}

function createDefaultLineSettings(): EditorLineSettings {
  return {
    color: '#111827',
    width: 3,
    style: 'solid',
    corners: 'round',
    roughness: 0,
    bowing: 0,
    opacity: 1,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: '#111827',
    shadowDistance: 4,
    fillMode: 'none',
    fillColor: '#ffffff',
    fillOpacity: 0.2,
    gradientFrom: '#ffffff',
    gradientTo: DEFAULT_COLOR_ACCENT,
    gradientStops: [
      { color: '#ffffff', offset: 0 },
      { color: DEFAULT_COLOR_ACCENT, offset: 1 },
    ],
    gradientAngle: 0,
    roughFillStyle: 'hachure',
    roughFillColor: '#ffffff',
    roughFillGap: 8,
    roughFillAngle: -41,
    roughFillWeight: 1,
    roughFillRoughness: 1,
    roughFillBowing: 1,
    roughFillOpacity: 0.2,
  };
}

function createDefaultTextSettings() {
  const textColor = '#111827';
  return {
    calloutFormat: 'plain' as const,
    layoutMode: 'fixed-width' as const,
    textAlign: 'left' as const,
    verticalAlign: 'top' as const,
    fontFamily: 'sans' as const,
    fontSize: 16,
    fontWeight: 'normal' as const,
    fontStyle: 'normal' as const,
    underline: false,
    linethrough: false,
    textColor,
    textOpacity: 1,
    backgroundColor: '#f97316',
    backgroundOpacity: 1,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: textColor,
    shadowDistance: 4,
    tailSize: 10,
  };
}

function createDefaultBrushSettings(args: {
  color: string;
  dynamicWidth?: boolean;
  width: number;
  opacity: number;
  shapeCorrection: EditorBrushSettings['shapeCorrection'];
}) {
  return {
    color: args.color,
    dynamicWidth: args.dynamicWidth ?? false,
    width: args.width,
    opacity: args.opacity,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: args.color,
    shadowDistance: 4,
    smoothingLevel: 10,
    shapeCorrection: args.shapeCorrection,
  };
}

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
  const defaultEllipseSettings = { ...defaultRectangleSettings };
  const defaultImageSettings = createDefaultImageSettings(borderPreset);

  return {
    pencil: createDefaultBrushSettings({
      color: DEFAULT_COLOR_ACCENT,
      dynamicWidth: true,
      width: 4,
      opacity: 1,
      shapeCorrection: 'subtle',
    }),
    highlighter: createDefaultBrushSettings({
      color: DEFAULT_COLOR_WARNING,
      width: 18,
      opacity: 0.28,
      shapeCorrection: 'off',
    }),
    rectangle: defaultRectangleSettings,
    ellipse: defaultEllipseSettings,
    blur: { ...DEFAULT_BLUR_SETTINGS },
    arrow: createDefaultArrowSettings(),
    line: createDefaultLineSettings(),
    callout: {
      style: { ...defaultRectangleSettings, radius: 12 },
      text: createDefaultTextSettings(),
      tailSide: 'top',
    },
    text: createDefaultTextSettings(),
    step: createDefaultStepSettings(defaultRectangleSettings.strokeColor),
    image: defaultImageSettings,
  };
};
