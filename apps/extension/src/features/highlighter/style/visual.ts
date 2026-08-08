import type { CSSProperties } from 'react';
import { validateCssString } from '../css-sanitizer/css';
import {
  normalizeBorderPresetVisualFields,
  percentToUnit,
} from '@sniptale/ui/highlighter-style/normalize';
import type { BorderPadding, BorderVisualStyle } from '@sniptale/ui/highlighter-style/types';
import { projectFrameDecorationCssStyles } from './decoration';
import { parseColor } from '@sniptale/foundation/color';
import { getRepresentativeColor, serializePaintToCss } from '@sniptale/foundation/paint';

export interface ResolvedBorderPresetVisual {
  id: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: BorderVisualStyle['style'];
  radius: number;
  shadow: BorderVisualStyle['shadow'];
  /** Deterministic scalar bridge for consumers that cannot render Paint. */
  fillColor: string;
  /** Full Paint rendering for frame surfaces. */
  fillCss: string;
  inheritCustomCss: boolean;
  customCss: string;
  customCssStyles: CSSProperties;
  padding: BorderPadding;
}

export function colorToRgba(color: string, opacityPercent: number): string {
  if (color.trim().toLowerCase() === 'transparent') return color;
  const parsed = parseColor(color);
  const alpha = parsed ? parsed.alpha * percentToUnit(opacityPercent) : null;
  return parsed
    ? `rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${Number(alpha!.toFixed(4))})`
    : color;
}

function resolveCustomCssStyles(preset: BorderVisualStyle): CSSProperties {
  if (!preset.inheritCustomCss) {
    return {};
  }

  const validation = validateCssString(preset.customCss);
  if (validation.rawError || validation.hasBlockedProps) {
    return {};
  }

  return projectFrameDecorationCssStyles(validation.styles);
}

export function resolveBorderPresetVisual(
  preset: BorderVisualStyle & { id?: string; sourcePresetId?: string }
): ResolvedBorderPresetVisual {
  const normalizedPreset = normalizeBorderPresetVisualFields(preset);

  return {
    id: normalizedPreset.sourcePresetId ?? normalizedPreset.id ?? 'manual',
    strokeColor: normalizedPreset.color,
    strokeWidth: normalizedPreset.width,
    strokeStyle: normalizedPreset.style,
    radius: normalizedPreset.radius,
    shadow: normalizedPreset.shadow,
    fillCss: serializePaintToCss(normalizedPreset.fillPaint),
    fillColor: getRepresentativeColor(normalizedPreset.fillPaint),
    inheritCustomCss: normalizedPreset.inheritCustomCss,
    customCss: normalizedPreset.customCss,
    customCssStyles: resolveCustomCssStyles(normalizedPreset),
    padding: normalizedPreset.padding,
  };
}
