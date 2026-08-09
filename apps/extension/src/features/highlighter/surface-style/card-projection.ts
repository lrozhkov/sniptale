import { getRepresentativeColor, serializePaintToCss } from '@sniptale/foundation/paint';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { resolveCalloutColorBindings } from '../callout-color-bindings';
import { extractCalloutCardCss } from './card-section';
import { projectCanonicalSurfaceCss } from './surface-css';

type CalloutCardStyleProjection = Record<string, string | number>;

export function projectCalloutCardStyle(
  style: CalloutVisualStyle,
  frameColors?: {
    fillPaint?: CalloutVisualStyle['surface']['fillPaint'];
    borderColor?: string;
    suppressNativeFill?: boolean;
  }
): CalloutCardStyleProjection {
  const resolved = resolveCalloutColorBindings(style, {
    borderColor: frameColors?.borderColor,
    fillColor: frameColors?.fillPaint ? getRepresentativeColor(frameColors.fillPaint) : undefined,
    fillPaint: frameColors?.fillPaint,
  });
  const cardCss = extractCalloutCardCss(style.customCss);
  const custom = cardCss === null ? null : projectCanonicalSurfaceCss(cardCss);
  return {
    background: frameColors?.suppressNativeFill
      ? 'transparent'
      : serializePaintToCss(resolved.surface.fillPaint),
    borderColor: resolved.surface.borderColor,
    borderStyle: resolved.surface.borderStyle,
    borderWidth: resolved.surface.borderWidth,
    borderRadius: resolved.surface.radius,
    boxShadow:
      resolved.surface.shadow > 0
        ? `0 ${Math.max(1, resolved.surface.shadow / 3)}px ${resolved.surface.shadow}px ${resolved.surface.shadowColor}`
        : 'none',
    color: resolved.surface.textColor,
    padding: `${resolved.surface.paddingY}px ${resolved.surface.paddingX}px`,
    ...(custom ?? {}),
  };
}
