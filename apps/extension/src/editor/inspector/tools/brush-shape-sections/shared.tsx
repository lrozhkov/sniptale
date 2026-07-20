import type { BrushControlsProps, BrushSettings, ShapeSettings } from './types';

export function buildBrushColorControlProps(
  tool: 'pencil' | 'highlighter',
  props: BrushControlsProps,
  settings: BrushSettings,
  palette: readonly string[]
) {
  return {
    onChange: (color: string) =>
      props.updateColor((next: string) => props.applyBrushPatch(tool, { color: next }), color),
    onPreviewChange: (color: string) =>
      props.previewColor((next: string) => props.applyBrushPatch(tool, { color: next }), color),
    onPreviewReset: (color: string) =>
      props.previewColor((next: string) => props.applyBrushPatch(tool, { color: next }), color),
    palette,
    recentColors: props.recentColors,
    value: settings.color,
  };
}

export function buildShapeColorControlProps(
  value: string,
  recentColors: string[],
  onChange: (color: string) => void,
  onPreviewChange: (color: string) => void,
  palette: readonly string[]
) {
  return {
    onPreviewChange,
    onPreviewReset: onPreviewChange,
    palette,
    value,
    recentColors,
    onChange,
  };
}

export function getShapeStrokeWidthLabel(settings: Pick<ShapeSettings, 'strokeWidth'>) {
  return `${settings.strokeWidth}px`;
}

export function getShapePresetValue(settings: Pick<ShapeSettings, 'borderPresetId'>) {
  return settings.borderPresetId ?? '';
}
