import { serializePaintToCss } from '@sniptale/foundation/paint';
import { TOUR_HINT_SURFACE } from '@sniptale/runtime-contracts/scenario/types/tour';
import { projectCanonicalSurfaceCss } from '../../highlighter/surface-style/surface-css';

/** Reuses the callout decoration policy; CSS cannot affect placement or load external resources. */
export function applyTourHintSurface(hint, authored) {
  const surface = authored ?? TOUR_HINT_SURFACE;
  hint.removeAttribute('style');
  Object.assign(hint.style, {
    background: serializePaintToCss(surface.fillPaint),
    color: surface.textColor,
    padding: `${surface.padding}px`,
    borderRadius: `${surface.radius}px`,
    ...(projectCanonicalSurfaceCss(surface.surfaceCss) ?? {}),
  });
  return surface;
}

/** Size the card and reserve its navigation chrome before measuring text pages. */
export function sizeTourHint({ hint, hintText, surface, appearance, stageWidth, stageHeight }) {
  const maximumHeight = Math.max(1, Math.min(240, stageHeight - 16));
  const preferredWidth = appearance.presentation === 'callout' ? surface.width : stageWidth - 16;
  hint.style.width = `${Math.max(1, Math.min(stageWidth - 16, preferredWidth))}px`;
  hint.style.maxHeight = `${maximumHeight}px`;
  const chromeHeight =
    hint.querySelector('.tour-hint-header').offsetHeight +
    hint.querySelector('.tour-hint-controls').offsetHeight;
  const textHeight = maximumHeight - chromeHeight - surface.padding * 2 - 18;
  hintText.style.maxHeight = `${Math.max(1, textHeight)}px`;
}
