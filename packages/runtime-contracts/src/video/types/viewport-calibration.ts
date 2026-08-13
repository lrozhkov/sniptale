export type ViewportCalibrationColor = Readonly<{
  blue: number;
  green: number;
  red: number;
}>;

export type ViewportCalibrationPattern = Readonly<{
  colors: Readonly<{
    bottom: ViewportCalibrationColor;
    left: ViewportCalibrationColor;
    right: ViewportCalibrationColor;
    top: ViewportCalibrationColor;
  }>;
  edgeThicknessCss: number;
}>;

export type ViewportFrameVerification = Readonly<{
  pattern: ViewportCalibrationPattern;
  phase: 'clean' | 'marked';
}>;

const MIN_EDGE_THICKNESS_CSS = 4;
const MAX_EDGE_THICKNESS_CSS = 24;
const MIN_COLOR_DISTANCE_SQUARED = 72 * 72;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColorChannel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

function isViewportCalibrationColor(value: unknown): value is ViewportCalibrationColor {
  return (
    isRecord(value) &&
    isColorChannel(value['red']) &&
    isColorChannel(value['green']) &&
    isColorChannel(value['blue'])
  );
}

function colorDistanceSquared(
  left: ViewportCalibrationColor,
  right: ViewportCalibrationColor
): number {
  return (
    (left.red - right.red) ** 2 + (left.green - right.green) ** 2 + (left.blue - right.blue) ** 2
  );
}

function hasDistinctColors(colors: readonly ViewportCalibrationColor[]): boolean {
  for (let left = 0; left < colors.length; left += 1) {
    for (let right = left + 1; right < colors.length; right += 1) {
      if (colorDistanceSquared(colors[left]!, colors[right]!) < MIN_COLOR_DISTANCE_SQUARED) {
        return false;
      }
    }
  }
  return true;
}

export function isViewportCalibrationPattern(value: unknown): value is ViewportCalibrationPattern {
  if (!isRecord(value) || !isRecord(value['colors'])) return false;
  const thickness = value['edgeThicknessCss'];
  if (
    typeof thickness !== 'number' ||
    !Number.isInteger(thickness) ||
    thickness < MIN_EDGE_THICKNESS_CSS ||
    thickness > MAX_EDGE_THICKNESS_CSS
  ) {
    return false;
  }
  const colors = value['colors'];
  const ordered = [colors['top'], colors['right'], colors['bottom'], colors['left']];
  return (
    ordered.every(isViewportCalibrationColor) &&
    hasDistinctColors(ordered as ViewportCalibrationColor[])
  );
}

export function isViewportFrameVerification(value: unknown): value is ViewportFrameVerification {
  return (
    isRecord(value) &&
    (value['phase'] === 'marked' || value['phase'] === 'clean') &&
    isViewportCalibrationPattern(value['pattern'])
  );
}
