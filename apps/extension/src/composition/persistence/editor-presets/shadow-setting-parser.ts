import type {
  EditorArrowSettings,
  EditorBrushSettings,
} from '../../../features/editor/document/types';
import { isNumber, isString } from '../infrastructure/guards/primitives';

export function parsePresetShadowSettings(
  value: Record<string, unknown>,
  fallbackColor: string
): Pick<
  EditorArrowSettings & EditorBrushSettings,
  'shadowAngle' | 'shadowBlur' | 'shadowColor' | 'shadowDistance'
> {
  return {
    shadowAngle: isNumber(value['shadowAngle']) ? value['shadowAngle'] : 90,
    shadowBlur: isNumber(value['shadowBlur']) ? value['shadowBlur'] : 12,
    shadowColor: isString(value['shadowColor']) ? value['shadowColor'] : fallbackColor,
    shadowDistance: isNumber(value['shadowDistance']) ? value['shadowDistance'] : 4,
  };
}
