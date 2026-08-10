import {
  DRAWING_ARROW_WIDTHS,
  DRAWING_MARKER_OPACITIES,
  DRAWING_MARKER_WIDTHS,
  DRAWING_OUTLINE_WIDTHS,
  DRAWING_PENCIL_WIDTHS,
  DRAWING_TEXT_FONT_FAMILIES,
  DRAWING_TEXT_SIZES,
  type DrawingArrowDesign,
  type DrawingFontFamily,
  type DrawingShapeKind,
  type DrawingToolDefaults,
} from '../../../../features/drawing/public';

const OPAQUE_HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ALPHA_HEX_COLOR = /^#[0-9a-f]{8}$/i;
const SHAPE_KINDS: readonly DrawingShapeKind[] = [
  'rectangle',
  'ellipse',
  'triangle',
  'parallelogram',
];
const ARROW_DESIGNS: readonly DrawingArrowDesign[] = ['standard', 'freehand'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isColor = (value: unknown): value is string =>
  typeof value === 'string' && OPAQUE_HEX_COLOR.test(value);
const isColorWithOptionalAlpha = (value: unknown): value is string =>
  isColor(value) || (typeof value === 'string' && ALPHA_HEX_COLOR.test(value));
const isNumberOption = (value: unknown, options: readonly number[]): value is number =>
  typeof value === 'number' && options.includes(value);
const isStringOption = <Value extends string>(
  value: unknown,
  options: readonly Value[]
): value is Value => typeof value === 'string' && options.includes(value as Value);

export function cloneDrawingToolDefaults(defaults: DrawingToolDefaults): DrawingToolDefaults {
  return {
    pencil: { ...defaults.pencil },
    marker: { ...defaults.marker },
    shape: { ...defaults.shape },
    arrow: { ...defaults.arrow },
    text: { ...defaults.text },
  };
}

function parseDefaults(value: unknown): DrawingToolDefaults | null {
  if (!isRecord(value)) return null;
  const { pencil, marker, shape, arrow, text } = value;
  if (
    !isRecord(pencil) ||
    !isColor(pencil['color']) ||
    !isNumberOption(pencil['width'], DRAWING_PENCIL_WIDTHS) ||
    !isRecord(marker) ||
    !isColor(marker['color']) ||
    !isNumberOption(marker['opacity'], DRAWING_MARKER_OPACITIES) ||
    !isNumberOption(marker['width'], DRAWING_MARKER_WIDTHS) ||
    !isRecord(shape) ||
    !isColor(shape['color']) ||
    !(
      shape['fillColor'] === undefined ||
      shape['fillColor'] === null ||
      isColorWithOptionalAlpha(shape['fillColor'])
    ) ||
    !isStringOption(shape['kind'], SHAPE_KINDS) ||
    !isNumberOption(shape['width'], DRAWING_OUTLINE_WIDTHS) ||
    !isRecord(arrow) ||
    !isColor(arrow['color']) ||
    !isStringOption(arrow['design'], ARROW_DESIGNS) ||
    typeof arrow['dynamicWidth'] !== 'boolean' ||
    !isNumberOption(arrow['width'], DRAWING_ARROW_WIDTHS) ||
    !isRecord(text) ||
    !isColor(text['color']) ||
    !(text['backgroundColor'] === null || isColorWithOptionalAlpha(text['backgroundColor'])) ||
    !isStringOption<DrawingFontFamily>(text['fontFamily'], DRAWING_TEXT_FONT_FAMILIES) ||
    !isNumberOption(text['fontSize'], DRAWING_TEXT_SIZES)
  ) {
    return null;
  }
  return {
    pencil: { color: pencil['color'], width: pencil['width'] },
    marker: {
      color: marker['color'],
      opacity: marker['opacity'],
      width: marker['width'],
    },
    shape: {
      color: shape['color'],
      fillColor: shape['fillColor'] ?? null,
      kind: shape['kind'] === 'parallelogram' ? 'rectangle' : shape['kind'],
      width: shape['width'],
    },
    arrow: {
      color: arrow['color'],
      design: arrow['design'],
      dynamicWidth: arrow['dynamicWidth'],
      width: arrow['width'],
    },
    text: {
      backgroundColor: text['backgroundColor'],
      color: text['color'],
      fontFamily: text['fontFamily'],
      fontSize: text['fontSize'],
    },
  };
}

export function parseDrawingToolPreferences(
  value: unknown,
  fallback: DrawingToolDefaults
): { defaults: DrawingToolDefaults; unsafeForWrite: boolean } {
  if (value === undefined) {
    return { defaults: cloneDrawingToolDefaults(fallback), unsafeForWrite: false };
  }
  if (!isRecord(value) || value['schemaVersion'] !== 1) {
    return { defaults: cloneDrawingToolDefaults(fallback), unsafeForWrite: true };
  }
  const defaults = parseDefaults(value['defaults']);
  return defaults
    ? { defaults, unsafeForWrite: false }
    : { defaults: cloneDrawingToolDefaults(fallback), unsafeForWrite: true };
}
