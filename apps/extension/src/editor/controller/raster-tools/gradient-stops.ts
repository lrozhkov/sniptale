import {
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
} from '../../../features/editor/document/gradient';
import type { EditorRasterToolSettings } from '../../state/raster-tools';

export function resolveRasterGradientStops(settings: EditorRasterToolSettings) {
  return normalizeEditorGradientStops(
    settings.gradientStops,
    createEditorGradientFallbackStops(settings.gradientFrom, settings.gradientTo)
  );
}
