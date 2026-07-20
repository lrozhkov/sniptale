import type { BlurSettings, BorderPreset } from '../../highlighter/contracts';

export interface EditorImageSettings {
  borderPresetId: string | null;
  opacity: number;
  radius: number;
  shadow: BorderPreset['shadow'];
  shadowAngle?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowDistance?: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeStyle: NonNullable<BlurSettings['strokeStyle']>;
  strokeWidth: number;
}

export const DEFAULT_EDITOR_IMAGE_SETTINGS: EditorImageSettings = {
  borderPresetId: null,
  opacity: 1,
  radius: 0,
  shadow: 0,
  shadowAngle: 90,
  shadowBlur: 12,
  shadowColor: '#475569',
  shadowDistance: 4,
  strokeColor: '#475569',
  strokeOpacity: 1,
  strokeStyle: 'solid',
  strokeWidth: 0,
};

function normalizeUnit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function normalizeStrokeStyle(
  value: unknown,
  fallback: EditorImageSettings['strokeStyle']
): EditorImageSettings['strokeStyle'] {
  return value === 'dashed' ||
    value === 'dotted' ||
    value === 'dash' ||
    value === 'dot' ||
    value === 'dash-dot' ||
    value === 'long-dash' ||
    value === 'solid'
    ? value
    : fallback;
}

export function normalizeEditorImageSettings(
  settings: Partial<EditorImageSettings> | null | undefined
): EditorImageSettings {
  const fallback = DEFAULT_EDITOR_IMAGE_SETTINGS;

  return {
    borderPresetId:
      typeof settings?.borderPresetId === 'string' || settings?.borderPresetId === null
        ? settings.borderPresetId
        : fallback.borderPresetId,
    opacity: normalizeUnit(settings?.opacity, fallback.opacity),
    radius: normalizeNumber(settings?.radius, fallback.radius),
    shadow: normalizeNumber(settings?.shadow, fallback.shadow),
    shadowAngle: normalizeNumber(settings?.shadowAngle, fallback.shadowAngle ?? 90),
    shadowBlur: normalizeNumber(settings?.shadowBlur, fallback.shadowBlur ?? 12),
    shadowColor: normalizeColor(
      settings?.shadowColor,
      fallback.shadowColor ?? fallback.strokeColor
    ),
    shadowDistance: normalizeNumber(settings?.shadowDistance, fallback.shadowDistance ?? 4),
    strokeColor: normalizeColor(settings?.strokeColor, fallback.strokeColor),
    strokeOpacity: normalizeUnit(settings?.strokeOpacity, fallback.strokeOpacity),
    strokeStyle: normalizeStrokeStyle(settings?.strokeStyle, fallback.strokeStyle),
    strokeWidth: normalizeNumber(settings?.strokeWidth, fallback.strokeWidth),
  };
}
