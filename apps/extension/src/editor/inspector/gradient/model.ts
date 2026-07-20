import {
  addEditorGradientStop,
  clampEditorGradientOpacity,
  clampEditorGradientOffset,
  createEditorGradientCssStops,
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
  removeEditorGradientStop,
  reverseEditorGradientStops,
  type EditorGradientColorStop,
} from '../../../features/editor/document/gradient';

export function normalizeGradientEditorStops(
  stops: readonly EditorGradientColorStop[],
  fallbackFrom = '#ffffff',
  fallbackTo = '#000000'
): EditorGradientColorStop[] {
  return normalizeEditorGradientStops(
    stops,
    createEditorGradientFallbackStops(fallbackFrom, fallbackTo)
  );
}

export function createGradientEditorBackground(stops: readonly EditorGradientColorStop[]): string {
  return `linear-gradient(90deg, ${createEditorGradientCssStops(stops)})`;
}

export function addGradientEditorStop(
  stops: readonly EditorGradientColorStop[],
  selectedIndex: number
): EditorGradientColorStop[] {
  return addEditorGradientStop(stops, selectedIndex);
}

export function removeGradientEditorStop(
  stops: readonly EditorGradientColorStop[],
  selectedIndex: number
): EditorGradientColorStop[] {
  return removeEditorGradientStop(stops, selectedIndex);
}

export function reverseGradientEditorStops(
  stops: readonly EditorGradientColorStop[]
): EditorGradientColorStop[] {
  return reverseEditorGradientStops(stops);
}

export function updateGradientEditorStop(
  stops: readonly EditorGradientColorStop[],
  selectedIndex: number,
  patch: Partial<EditorGradientColorStop>
): EditorGradientColorStop[] {
  return normalizeGradientEditorStops(
    stops.map((stop, index) =>
      index === selectedIndex
        ? {
            color: patch.color ?? stop.color,
            offset: clampEditorGradientOffset(patch.offset ?? stop.offset),
            ...('opacity' in patch || stop.opacity !== undefined
              ? { opacity: clampEditorGradientOpacity(patch.opacity ?? stop.opacity ?? 1) }
              : {}),
          }
        : stop
    )
  );
}
