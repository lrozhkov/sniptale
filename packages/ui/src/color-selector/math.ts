import {
  clampRgbChannel,
  hexToRgb,
  resolvePickerColor,
  rgbToHex,
  type RgbColor,
} from './normalize';

export interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

interface HslColor {
  hue: number;
  lightness: number;
  saturation: number;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampHue(value: number): number {
  return Math.max(0, Math.min(359, Math.round(value)));
}

function normalizeHue(value: number): number {
  const wrappedValue = value % 360;
  return wrappedValue < 0 ? wrappedValue + 360 : wrappedValue;
}

function getRgbUnitBounds(color: RgbColor) {
  const red = clampRgbChannel(color.red) / 255;
  const green = clampRgbChannel(color.green) / 255;
  const blue = clampRgbChannel(color.blue) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  return {
    blue,
    delta: max - min,
    green,
    max,
    min,
    red,
  };
}

function getHueFromRgbBounds(bounds: ReturnType<typeof getRgbUnitBounds>) {
  if (bounds.delta === 0) {
    return 0;
  }

  if (bounds.max === bounds.red) {
    return ((bounds.green - bounds.blue) / bounds.delta) % 6;
  }
  if (bounds.max === bounds.green) {
    return (bounds.blue - bounds.red) / bounds.delta + 2;
  }

  return (bounds.red - bounds.green) / bounds.delta + 4;
}

function parseHslChannel(value: string, max: number): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : null;
}

function rgbToHsv(color: RgbColor): HsvColor {
  const bounds = getRgbUnitBounds(color);
  const hue = getHueFromRgbBounds(bounds);

  return {
    hue: normalizeHue(hue * 60),
    saturation: bounds.max === 0 ? 0 : bounds.delta / bounds.max,
    value: bounds.max,
  };
}

function rgbToHsl(color: RgbColor): HslColor {
  const bounds = getRgbUnitBounds(color);
  const lightness = (bounds.max + bounds.min) / 2;

  if (bounds.delta === 0) {
    return { hue: 0, saturation: 0, lightness: Math.round(lightness * 100) };
  }

  const saturation = bounds.delta / (1 - Math.abs(2 * lightness - 1));
  const hue = getHueFromRgbBounds(bounds);

  return {
    hue: Math.round(normalizeHue(hue * 60)),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  };
}

function buildRgb(red: number, green: number, blue: number, match: number): RgbColor {
  return {
    red: clampRgbChannel((red + match) * 255),
    green: clampRgbChannel((green + match) * 255),
    blue: clampRgbChannel((blue + match) * 255),
  };
}

function buildRgbFromHueSection(hue: number, chroma: number, match: number): RgbColor {
  const hueIndex = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueIndex % 2) - 1));

  if (hueIndex < 1) {
    return buildRgb(chroma, secondary, 0, match);
  }
  if (hueIndex < 2) {
    return buildRgb(secondary, chroma, 0, match);
  }
  if (hueIndex < 3) {
    return buildRgb(0, chroma, secondary, match);
  }
  if (hueIndex < 4) {
    return buildRgb(0, secondary, chroma, match);
  }
  if (hueIndex < 5) {
    return buildRgb(secondary, 0, chroma, match);
  }

  return buildRgb(chroma, 0, secondary, match);
}

function hsvToRgb(color: HsvColor): RgbColor {
  const hue = normalizeHue(color.hue);
  const saturation = clampUnit(color.saturation);
  const value = clampUnit(color.value);
  const chroma = value * saturation;
  return buildRgbFromHueSection(hue, chroma, value - chroma);
}

function hslToRgb(color: HslColor): RgbColor {
  const hue = normalizeHue(color.hue);
  const saturation = clampUnit(color.saturation / 100);
  const lightness = clampUnit(color.lightness / 100);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  return buildRgbFromHueSection(hue, chroma, lightness - chroma / 2);
}

function getResolvedRgb(color: string) {
  return hexToRgb(resolvePickerColor(color)) ?? { red: 249, green: 115, blue: 22 };
}

export function updateRgbChannel(
  color: string,
  channel: keyof RgbColor,
  rawValue: string
): string | null {
  const rgbColor = hexToRgb(color);
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!rgbColor || !Number.isFinite(parsedValue)) {
    return null;
  }

  return rgbToHex({
    ...rgbColor,
    [channel]: clampRgbChannel(parsedValue),
  });
}

export function hexToHsl(value: string): HslColor | null {
  const rgbColor = hexToRgb(value);
  return rgbColor ? rgbToHsl(rgbColor) : null;
}

export function hslToHex(color: HslColor): string {
  return rgbToHex(hslToRgb(color));
}

export function hexToHsv(value: string): HsvColor | null {
  const rgbColor = hexToRgb(value);
  return rgbColor ? rgbToHsv(rgbColor) : null;
}

export function hsvToHex(color: HsvColor): string {
  return rgbToHex(
    hsvToRgb({
      hue: clampHue(color.hue),
      saturation: clampUnit(color.saturation),
      value: clampUnit(color.value),
    })
  );
}

export function updateHslChannel(
  color: string,
  channel: keyof HslColor,
  rawValue: string
): string | null {
  const hslColor = hexToHsl(color);
  const parsedValue = parseHslChannel(rawValue, channel === 'hue' ? 359 : 100);
  if (!hslColor || parsedValue === null) {
    return null;
  }

  return hslToHex({
    ...hslColor,
    [channel]: parsedValue,
  });
}

export function getPlaneColor(color: string): string {
  return getPlaneColorFromHue(rgbToHsv(getResolvedRgb(color)).hue);
}

export function getPlaneColorFromHue(hue: number): string {
  return hsvToHex({
    hue,
    saturation: 1,
    value: 1,
  });
}

export function getHueFromColor(color: string): number {
  return rgbToHsv(getResolvedRgb(color)).hue;
}

export function getSaturationFromColor(color: string): number {
  return rgbToHsv(getResolvedRgb(color)).saturation;
}

export function getValueFromColor(color: string): number {
  return rgbToHsv(getResolvedRgb(color)).value;
}

export function getColorFromPlanePoint(args: {
  hue: number;
  left: number;
  top: number;
  width: number;
  height: number;
}): string {
  return hsvToHex({
    hue: args.hue,
    saturation: clampUnit(args.left / args.width),
    value: clampUnit(1 - args.top / args.height),
  });
}

export function getColorFromHue(hue: number, currentColor: string): string {
  return hsvToHex({
    hue,
    saturation: getSaturationFromColor(currentColor),
    value: getValueFromColor(currentColor),
  });
}
