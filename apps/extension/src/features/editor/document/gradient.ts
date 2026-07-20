import {
  addGradientStop,
  clampGradientOffset,
  clampGradientOpacity,
  createGradientColorStopColor,
  createGradientFallbackStops,
  normalizeGradientStops,
  removeGradientStop,
  resolveGradientFallbackOffset,
  resolveGradientStopOpacity,
  reverseGradientStops,
} from '@sniptale/foundation/gradient-stops';

export interface EditorGradientColorStop {
  color: string;
  offset: number;
  opacity?: number | undefined;
}

export function clampEditorGradientOffset(offset: number): number {
  return clampGradientOffset(offset);
}

export function clampEditorGradientOpacity(opacity: number): number {
  return clampGradientOpacity(opacity);
}

export function resolveEditorGradientStopOpacity(stop: EditorGradientColorStop): number {
  return resolveGradientStopOpacity(stop);
}

export function createEditorGradientFallbackStops(
  from: string,
  to: string
): EditorGradientColorStop[] {
  return createGradientFallbackStops(from, to);
}

export function normalizeEditorGradientStops(
  stops: readonly EditorGradientColorStop[] | null | undefined,
  fallback: readonly EditorGradientColorStop[]
): EditorGradientColorStop[] {
  return normalizeGradientStops(stops, fallback);
}

export function normalizeEditorGradientColorList(
  colors: readonly string[] | null | undefined,
  from: string,
  to: string
): EditorGradientColorStop[] {
  const sourceColors: string[] = colors ? [...colors] : [];
  const stops = sourceColors
    .filter((color) => typeof color === 'string' && color.length > 0)
    .map((color, index, list) => ({
      color,
      offset: resolveGradientFallbackOffset(index, list.length),
    }));

  return normalizeEditorGradientStops(stops, createEditorGradientFallbackStops(from, to));
}

export function addEditorGradientStop(
  stops: readonly EditorGradientColorStop[],
  selectedIndex: number
): EditorGradientColorStop[] {
  return addGradientStop(stops, selectedIndex, createEditorGradientFallbackStops('#fff', '#000'));
}

export function removeEditorGradientStop(
  stops: readonly EditorGradientColorStop[],
  selectedIndex: number
): EditorGradientColorStop[] {
  return removeGradientStop(
    stops,
    selectedIndex,
    createEditorGradientFallbackStops('#fff', '#000')
  );
}

export function reverseEditorGradientStops(
  stops: readonly EditorGradientColorStop[]
): EditorGradientColorStop[] {
  return reverseGradientStops(stops, createEditorGradientFallbackStops('#fff', '#000'));
}

export function createEditorGradientColorStopColor(
  stop: EditorGradientColorStop,
  opacityMultiplier = 1
): string {
  return createGradientColorStopColor(stop, opacityMultiplier);
}

export function createEditorGradientCssStops(stops: readonly EditorGradientColorStop[]): string {
  return stops
    .map(
      (stop) =>
        `${createEditorGradientColorStopColor(stop)} ${Math.round(
          clampEditorGradientOffset(stop.offset) * 100
        )}%`
    )
    .join(', ');
}
