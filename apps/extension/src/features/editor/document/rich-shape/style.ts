import { DEFAULT_RICH_SHAPE_STYLE } from './defaults';
import type {
  EditorRichShapeArrowhead,
  EditorRichShapeDashStyle,
  EditorRichShapeGradientFill,
  EditorRichShapeLineCap,
  EditorRichShapeLineJoin,
  EditorRichShapeStyle,
} from './types';
import { isRecord, isString, nullableStringOr, numberOr, oneOfOr, stringOr } from './values';

const DASH_STYLES: readonly EditorRichShapeDashStyle[] = [
  'solid',
  'dash',
  'dot',
  'dash-dot',
  'long-dash',
];
const LINE_CAPS: readonly EditorRichShapeLineCap[] = ['butt', 'round', 'square'];
const LINE_JOINS: readonly EditorRichShapeLineJoin[] = ['miter', 'round', 'bevel'];
const ARROWHEADS: readonly EditorRichShapeArrowhead[] = [
  'none',
  'triangle',
  'open',
  'stealth',
  'diamond',
  'oval',
];
const IMAGE_FITS = ['cover', 'contain', 'stretch', 'tile'] as const;

function normalizeGradientStops(value: unknown): EditorRichShapeGradientFill['stops'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((stop) => ({
    color: stringOr(stop['color'], '#ffffff'),
    offset: numberOr(stop['offset'], 0),
    transparency: numberOr(stop['transparency'], 0),
  }));
}

function normalizeFill(value: unknown): EditorRichShapeStyle['fill'] {
  if (!isRecord(value) || !isString(value['type'])) {
    return DEFAULT_RICH_SHAPE_STYLE.fill;
  }
  if (value['type'] === 'solid') {
    return { type: 'solid', color: stringOr(value['color'], '#ffffff') };
  }
  if (value['type'] === 'gradient') {
    return {
      type: 'gradient',
      gradientType: value['gradientType'] === 'radial' ? 'radial' : 'linear',
      angle: numberOr(value['angle'], 0),
      stops: normalizeGradientStops(value['stops']),
    };
  }
  if (value['type'] === 'image' || value['type'] === 'pattern') {
    return {
      type: value['type'],
      assetId: nullableStringOr(value['assetId'], null),
      fit: oneOfOr(value['fit'], IMAGE_FITS, 'cover'),
    };
  }

  return DEFAULT_RICH_SHAPE_STYLE.fill;
}

export function normalizeStyle(value: unknown): EditorRichShapeStyle {
  const style = isRecord(value) ? value : {};
  const line = isRecord(style['line']) ? style['line'] : {};
  return {
    ...DEFAULT_RICH_SHAPE_STYLE,
    fill: normalizeFill(style['fill']),
    fillTransparency: numberOr(
      style['fillTransparency'],
      DEFAULT_RICH_SHAPE_STYLE.fillTransparency
    ),
    line: {
      ...DEFAULT_RICH_SHAPE_STYLE.line,
      color: stringOr(line['color'], DEFAULT_RICH_SHAPE_STYLE.line.color),
      transparency: numberOr(line['transparency'], DEFAULT_RICH_SHAPE_STYLE.line.transparency),
      width: numberOr(line['width'], DEFAULT_RICH_SHAPE_STYLE.line.width),
      dashStyle: oneOfOr(line['dashStyle'], DASH_STYLES, DEFAULT_RICH_SHAPE_STYLE.line.dashStyle),
      cap: oneOfOr(line['cap'], LINE_CAPS, DEFAULT_RICH_SHAPE_STYLE.line.cap),
      join: oneOfOr(line['join'], LINE_JOINS, DEFAULT_RICH_SHAPE_STYLE.line.join),
      beginArrowhead: oneOfOr(
        line['beginArrowhead'],
        ARROWHEADS,
        DEFAULT_RICH_SHAPE_STYLE.line.beginArrowhead
      ),
      endArrowhead: oneOfOr(
        line['endArrowhead'],
        ARROWHEADS,
        DEFAULT_RICH_SHAPE_STYLE.line.endArrowhead
      ),
    },
    opacity: numberOr(style['opacity'], DEFAULT_RICH_SHAPE_STYLE.opacity),
    cornerRadius: numberOr(style['cornerRadius'], DEFAULT_RICH_SHAPE_STYLE.cornerRadius),
  };
}
