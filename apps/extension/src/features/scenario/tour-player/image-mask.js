import { serializePaintToCss } from '@sniptale/foundation/paint';
import { bindTourObjectDrag } from './authoring.js';
import { bindTourRectResize } from './authoring-rect.js';

/** The visual effect is separate from the authoring frame so opacity never fades its handles. */
export function renderTourMask(
  mask,
  imageBox,
  sourceWidth,
  { element, labels, authoring, signal }
) {
  const box = element('div', `tour-mask tour-mask-${mask.kind}`);
  Object.assign(box.style, {
    left: `${imageBox.x + mask.rect.x * imageBox.width}px`,
    top: `${imageBox.y + mask.rect.y * imageBox.height}px`,
    width: `${mask.rect.width * imageBox.width}px`,
    height: `${mask.rect.height * imageBox.height}px`,
  });
  const effect = element('div', 'tour-mask-effect');
  if (mask.kind === 'blur') {
    effect.style.backdropFilter = `blur(${((mask.blurRadius ?? 12) * imageBox.width) / sourceWidth}px)`;
  } else if (mask.kind === 'spotlight') {
    effect.style.boxShadow = `0 0 0 100vmax ${mask.spotlightColor ?? '#111827'}`;
    effect.style.opacity = String(mask.spotlightOpacity ?? 0.6);
  } else {
    effect.style.background =
      mask.kind === 'highlight' && mask.paint ? serializePaintToCss(mask.paint) : mask.color;
    effect.style.opacity = String(mask.kind === 'redact' ? 1 : mask.opacity);
  }
  box.append(effect);
  if (!authoring && mask.narration?.trigger === 'activation') {
    box.tabIndex = 0;
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', labels.play);
    box.dataset.tourNarration = mask.id;
    box.style.pointerEvents = 'auto';
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        box.click();
      }
    });
  }
  if (authoring) {
    box.tabIndex = 0;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', labels.details);
    box.style.pointerEvents = 'auto';
    box.addEventListener('click', () => authoring.onSelectObject(mask.id));
    box.addEventListener('keydown', (event) => {
      if (event.target !== box || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      authoring.onSelectObject(mask.id);
    });
    bindTourObjectDrag(
      box,
      { id: mask.id, point: mask.rect, maxX: 1 - mask.rect.width, maxY: 1 - mask.rect.height },
      imageBox,
      authoring,
      signal
    );
    bindTourRectResize(box, mask, imageBox, authoring, signal, labels.resize ?? labels.details);
  }
  return box;
}
