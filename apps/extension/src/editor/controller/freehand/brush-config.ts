import type { EditorBrushSettings } from '../../../features/editor/document/types';
import { createFabricShadow } from '../../objects/shadow';
import { hexToRgba } from '../../document/model';

const SMOOTHING_DIVISOR = 10;

interface LiveFreehandBrushSettingsTarget {
  color: string;
  decimate: number;
  dynamicWidth: boolean;
  shadow: unknown;
  smoothingLevel: number;
  width: number;
}

export function getBrushDecimate(settings: EditorBrushSettings): number {
  return Math.max(0, Math.min(10, settings.smoothingLevel)) / SMOOTHING_DIVISOR;
}

export function applyLiveFreehandBrushSettings(
  brush: LiveFreehandBrushSettingsTarget,
  settings: EditorBrushSettings
): void {
  brush.color = hexToRgba(settings.color, settings.opacity);
  brush.decimate = getBrushDecimate(settings);
  brush.dynamicWidth = settings.dynamicWidth === true;
  brush.shadow =
    createFabricShadow(settings.shadow, settings.shadowColor ?? settings.color, {
      angle: settings.shadowAngle ?? 90,
      blur: settings.shadowBlur ?? 12,
      distance: settings.shadowDistance ?? 4,
    }) ?? null;
  brush.smoothingLevel = settings.smoothingLevel;
  brush.width = settings.width;
}
