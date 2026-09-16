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
  const caption = appearance.presentation !== 'callout';
  const inset = caption ? 0 : 16;
  const maximumHeight = Math.max(1, Math.min(240, stageHeight - inset));
  const width = caption ? stageWidth : Math.min(stageWidth - inset, surface.width);
  hint.style.width = `${Math.max(1, width)}px`;
  hint.style.maxWidth = `${Math.max(1, stageWidth - inset)}px`;
  hint.style.maxHeight = `${maximumHeight}px`;
  if (caption)
    hint.style.borderRadius =
      appearance.presentation === 'caption-top'
        ? `0 0 ${surface.radius}px ${surface.radius}px`
        : `${surface.radius}px ${surface.radius}px 0 0`;
  const header = hint.querySelector('.tour-hint-header');
  const controls = hint.querySelector('.tour-hint-controls');
  const chromeHeight = caption
    ? Math.max(28, controls.offsetHeight)
    : header.offsetHeight + controls.offsetHeight;
  const textHeight = maximumHeight - chromeHeight - surface.padding * 2 - (caption ? 10 : 18);
  hintText.style.maxHeight = `${Math.max(1, textHeight)}px`;
}

/** Project the two navigation levels without a compound, ambiguous counter. */
export function updateTourHintNavigation(hint, { index, count, page, pages, pointLabel }) {
  const pageCount = hint.querySelector('[data-tour-hint-count]');
  const pointCount = hint.querySelector('[data-tour-hint-point-count]');
  pageCount.textContent = `${page + 1} / ${pages}`;
  pageCount.hidden = pages < 2;
  const position = `${index + 1} / ${count}`;
  pointCount.textContent =
    hint.dataset.presentation === 'callout' ? `${pointLabel} ${position}` : position;
  pointCount.setAttribute('aria-label', `${pointLabel} ${position}`);
  pointCount.hidden = count < 2;
  hint.querySelector('[data-tour-hint-previous]').disabled = index === 0 && page === 0;
  hint.querySelector('[data-tour-hint-next]').disabled = index === count - 1 && page === pages - 1;
}
