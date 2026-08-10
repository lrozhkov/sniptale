import { resolveFrameSurface } from '../frame-surface';
import { resolveBorderPresetVisual, resolveBorderShadowVisual } from '../style';
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
  const borderCssColor = borderVisual?.strokeColor ?? borderColor;
  const fillCss = borderVisual?.fillCss ?? 'transparent';
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
      fillCss,
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
