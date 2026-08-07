import { resolveFrameSurface } from '../frame-surface';
import { colorToRgba, resolveBorderPresetVisual, resolveBorderShadowVisual } from '../style';
import type { FrameAnnotationInteractionState, FrameAnnotationVisualState } from './model';
import {
  getFrameAnnotationFillStyle,
  getFrameAnnotationInteractiveStyle,
  getFrameAnnotationStrokeStyle,
} from './surface-style';

export function resolveFrameAnnotationVisualScene(params: {
  frame: FrameAnnotationVisualState;
  state: FrameAnnotationInteractionState;
  visualScale?: number;
}) {
  const { frame, state } = params;
  const visualScale = params.visualScale ?? 1;
  const borderVisual = frame.borderSettings
    ? resolveBorderPresetVisual(frame.borderSettings)
    : null;
  const surface = resolveFrameSurface(frame);
  const borderColor = borderVisual?.strokeColor ?? 'var(--sniptale-color-accent)';
  const borderCssColor = borderVisual
    ? colorToRgba(borderVisual.strokeColor, borderVisual.strokeOpacity)
    : borderColor;
  const fillCssColor = borderVisual
    ? colorToRgba(borderVisual.fillColor, borderVisual.fillOpacity)
    : 'transparent';
  const shadowVisual = borderVisual
    ? resolveBorderShadowVisual(borderVisual.shadow, borderColor)
    : null;

  return {
    borderColor,
    borderWidth: surface.geometry.strokeWidth,
    frameStyle: getFrameAnnotationInteractiveStyle({ frame, state }),
    fillStyle: getFrameAnnotationFillStyle({
      decorationVisible: surface.decorationVisible,
      fillVisible: surface.fillVisible,
      fillColor: fillCssColor,
      borderRadius: surface.geometry.radius * visualScale,
      ...(borderVisual ? { customCssStyles: borderVisual.customCssStyles } : {}),
    }),
    strokeStyle: getFrameAnnotationStrokeStyle({
      visible: surface.strokeVisible,
      borderWidth: surface.geometry.strokeWidth * visualScale,
      borderStyle: borderVisual?.strokeStyle ?? 'solid',
      borderColor: borderCssColor,
      borderRadius: surface.geometry.radius * visualScale,
      ...(shadowVisual?.frameBoxShadow === undefined
        ? {}
        : { boxShadow: shadowVisual.frameBoxShadow }),
    }),
    surface,
  };
}
