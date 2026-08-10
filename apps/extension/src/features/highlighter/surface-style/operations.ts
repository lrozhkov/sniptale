import { clonePaint } from '@sniptale/foundation/paint';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import type {
  SurfaceStyle,
  SurfaceStylePreset,
} from '@sniptale/runtime-contracts/highlighter/surface-style';
import { extractCalloutCardCss, replaceCalloutCardCss } from './card-section';
import { areSurfaceStylesEqual, cloneSurfaceStyle } from './style';
import { canonicalizeSurfaceCss } from './surface-css';

export function getCalloutSurfaceStyle(style: CalloutVisualStyle): SurfaceStyle | null {
  const surfaceCss = extractCalloutCardCss(style.customCss);
  const canonical = surfaceCss === null ? null : canonicalizeSurfaceCss(surfaceCss);
  return canonical === null
    ? null
    : { fillPaint: clonePaint(style.surface.fillPaint), surfaceCss: canonical };
}

export function applySurfaceStyleToCallout(
  callout: CalloutVisualStyle,
  surface: SurfaceStyle
): CalloutVisualStyle {
  const canonical = canonicalizeSurfaceCss(surface.surfaceCss);
  if (canonical === null) throw new TypeError('Cannot apply invalid Surface CSS');
  const customCss = replaceCalloutCardCss(callout.customCss, canonical);
  if (customCss === null)
    throw new TypeError('Cannot apply Surface Style to malformed Callout CSS');
  return {
    ...callout,
    customCss,
    surface: { ...callout.surface, fillPaint: clonePaint(surface.fillPaint) },
  };
}

export function matchSurfaceStylePreset(
  style: SurfaceStyle,
  presets: readonly SurfaceStylePreset[]
): SurfaceStylePreset | null {
  return presets.find((preset) => areSurfaceStylesEqual(style, preset.style)) ?? null;
}

export const cloneSurfaceStylePreset = (preset: SurfaceStylePreset): SurfaceStylePreset => ({
  ...preset,
  style: cloneSurfaceStyle(preset.style),
});
