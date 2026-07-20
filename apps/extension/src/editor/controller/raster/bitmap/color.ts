import { parseRgbColor } from '../../../color/parsing';

let colorParserContext: CanvasRenderingContext2D | null | undefined;

export function parseRasterColor(value: string): [number, number, number, number] {
  const hexColor = normalizeHexColor(value);
  if (hexColor) {
    return hexColor;
  }

  const rgbColor = parseRgbColor(value);
  if (rgbColor) {
    return [
      clampChannel(rgbColor.red),
      clampChannel(rgbColor.green),
      clampChannel(rgbColor.blue),
      clampAlpha(rgbColor.alpha ?? 1),
    ];
  }

  const parserContext = getColorParserContext();
  if (!parserContext) {
    return [0, 0, 0, 255];
  }

  parserContext.fillStyle = '#000000';
  const fallbackFillStyle = parserContext.fillStyle;
  parserContext.fillStyle = value;
  return parseRasterColor(parserContext.fillStyle || fallbackFillStyle);
}

function normalizeHexColor(value: string): [number, number, number, number] | null {
  const normalized = value.trim().replace(/^#/, '');
  if (![3, 4, 6, 8].includes(normalized.length)) {
    return null;
  }

  const expanded =
    normalized.length <= 4
      ? normalized
          .split('')
          .map((token) => token + token)
          .join('')
      : normalized;
  const withAlpha = expanded.length === 6 ? `${expanded}ff` : expanded;

  return [
    parseInt(withAlpha.slice(0, 2), 16),
    parseInt(withAlpha.slice(2, 4), 16),
    parseInt(withAlpha.slice(4, 6), 16),
    parseInt(withAlpha.slice(6, 8), 16),
  ];
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number): number {
  const normalized = value > 1 ? value / 255 : value;
  return clampChannel(normalized * 255);
}

function getColorParserContext(): CanvasRenderingContext2D | null {
  if (colorParserContext !== undefined) {
    return colorParserContext;
  }

  if (typeof document === 'undefined') {
    colorParserContext = null;
    return colorParserContext;
  }

  colorParserContext = document.createElement('canvas').getContext('2d');
  return colorParserContext;
}
