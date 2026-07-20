import {
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
  type EditorGradientColorStop,
} from '../../../features/editor/document/gradient';

type InspectorGradientSettings = {
  gradientFrom: string;
  gradientStops?: EditorGradientColorStop[] | null | undefined;
  gradientTo: string;
};

export function resolveInspectorGradientPatchState(settings: InspectorGradientSettings) {
  const stops = normalizeEditorGradientStops(
    settings.gradientStops,
    createEditorGradientFallbackStops(settings.gradientFrom, settings.gradientTo)
  );
  const createPatch = (gradientStops: EditorGradientColorStop[]) => ({
    gradientFrom: normalizeEditorGradientStops(
      gradientStops,
      createEditorGradientFallbackStops(settings.gradientFrom, settings.gradientTo)
    )[0]!.color,
    gradientTo: normalizeEditorGradientStops(
      gradientStops,
      createEditorGradientFallbackStops(settings.gradientFrom, settings.gradientTo)
    ).at(-1)!.color,
    gradientStops,
  });

  return { createPatch, stops };
}
