export type {
  BlurSettings,
  BlurStrokeStyle,
  BlurType,
  BorderPadding,
  BorderPreset,
  EffectMode,
  FocusSettings,
} from '@sniptale/ui/highlighter-style/types';
export { colorToRgba, resolveBorderPresetVisual, type ResolvedBorderPresetVisual } from './visual';
export {
  BORDER_SHADOW_HARD_INTENSITY,
  BORDER_SHADOW_SOFT_INTENSITY,
  formatBorderShadowIntensityValue,
  resolveBorderShadowVisual,
  type ResolvedBorderShadowVisual,
} from './shadow';
export {
  coerceBorderShadowIntensity,
  normalizeBorderPresetVisualFields,
  normalizeBorderShadowIntensity,
  percentToUnit,
} from '@sniptale/ui/highlighter-style/normalize';
