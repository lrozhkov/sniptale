import { createTourCaption } from './caption.js';
import { applyTourHintSurface, sizeTourHint, updateTourHintNavigation } from './hint-style.js';
/** Measures bounded text pages for captions and primary navigation copy. */
export function measureHintPages(hintText, fullText) {
  const characters = globalThis.Intl?.Segmenter
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(fullText)].map(
        (part) => part.segment
      )
    : Array.from(fullText);
  const pages = [];
  let offset = 0;
  while (offset < characters.length) {
    let low = 1;
    let high = characters.length - offset;
    let best = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      hintText.textContent = characters.slice(offset, offset + middle).join('');
      if (
        !hintText.clientHeight ? middle <= 160 : hintText.scrollHeight <= hintText.clientHeight + 1
      ) {
        best = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    if (offset + best < characters.length) {
      const candidate = characters.slice(offset, offset + best);
      const boundary = candidate.findLastIndex((character) => /\s/u.test(character));
      if (boundary >= best / 2) best = boundary + 1;
    }
    pages.push(characters.slice(offset, offset + best).join(''));
    offset += best;
  }
  if (!pages.length) pages.push('');
  return pages;
}

export function createTourHints(
  root,
  defaultAppearance,
  { onClose, focusTrigger, signal, keyboardScope, labels }
) {
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const viewport = query('viewport');
  const hint = query('hint');
  const hintText = query('hint-text');
  const hintPrevious = query('hint-previous');
  const hintNext = query('hint-next');
  const hintClose = query('hint-close');
  const voice = root.ownerDocument.createElement('button');
  voice.className = 'tour-button';
  voice.textContent = labels.play;
  voice.type = 'button';
  hintClose.before(voice);
  signal.addEventListener('abort', () => voice.remove(), { once: true });
  let activeHint = 0;
  let activeHintId = null;
  let textPage = 0;
  let pages = [];
  let hints = [];
  let dismissed = false;
  let restoringFocus = false;
  const caption = createTourCaption(hint, hintText, labels, paginate, signal);
  let geometry = { stageWidth: 640, stageHeight: 360, imageBox: null };
  function paginate() {
    const { stageWidth, stageHeight } = geometry;
    const current = dismissed ? null : hints[activeHint];
    if (!current) {
      hint.hidden = true;
      return;
    }
    voice.hidden = Boolean(keyboardScope) || current.narration?.trigger !== 'activation';
    voice.dataset.tourNarration = current.id;
    activeHintId = current.id;
    hint.hidden = false;
    const authoredAppearance = current.appearance ?? defaultAppearance;
    const appearance =
      stageWidth < 480 && authoredAppearance.presentation === 'callout'
        ? { ...authoredAppearance, presentation: 'caption-bottom' }
        : authoredAppearance;
    hint.dataset.presentation = appearance.presentation;
    caption.prepare(current, appearance.presentation);
    const surface = applyTourHintSurface(hint, appearance.surface ?? defaultAppearance.surface);
    hint.style.textAlign = appearance.alignment;
    sizeTourHint({ hint, hintText, surface, appearance, stageWidth, stageHeight });
    pages = measureHintPages(hintText, current.text || current.label || '');
    textPage = Math.min(textPage, pages.length - 1);
    hintText.textContent = pages[textPage];
    updateTourHintNavigation(hint, {
      index: activeHint,
      count: hints.length,
      page: textPage,
      pages: pages.length,
      pointLabel: labels.point,
    });
    caption.finish();
    const position = positionHint({ hint, viewport, geometry, current, appearance });
    hint.style.left = `${position.left}px`;
    hint.style.top = `${position.top}px`;
  }
  function changeHint(direction) {
    if (direction > 0 && textPage + 1 < pages.length) textPage += 1;
    else if (direction < 0 && textPage > 0) textPage -= 1;
    else if (activeHint + direction >= 0 && activeHint + direction < hints.length) {
      activeHint += direction;
      textPage = direction < 0 ? Number.MAX_SAFE_INTEGER : 0;
    }
    paginate();
  }
  hintPrevious.addEventListener('click', () => changeHint(-1), { signal });
  hintNext.addEventListener('click', () => changeHint(1), { signal });
  function dismiss() {
    if (hint.hidden) return;
    dismissed = true;
    hint.hidden = true;
    onClose();
    restoringFocus = true;
    try {
      focusTrigger(activeHint);
    } finally {
      restoringFocus = false;
    }
  }
  hintClose.addEventListener('click', dismiss, { signal });
  root.ownerDocument.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        (keyboardScope && !event.composedPath().includes(keyboardScope)) ||
        query('navigation').open ||
        hint.hidden
      )
        return;
      event.preventDefault();
      dismiss();
    },
    { signal }
  );
  return {
    setDefaultAppearance(value) {
      defaultAppearance = value;
    },
    get activeIndex() {
      return activeHint;
    },
    reset(sameScene = false) {
      if (sameScene && hint.dataset.presentation !== 'callout') return;
      caption.reset();
      activeHintId = null;
      activeHint = 0;
      textPage = 0;
      dismissed = false;
    },
    select(index) {
      if (restoringFocus) return;
      if (hints[index]?.id !== activeHintId || hint.dataset.presentation === 'callout')
        textPage = 0;
      activeHint = index;
      dismissed = false;
      paginate();
    },
    show(items, dimensions) {
      hints = items;
      activeHint = Math.min(activeHint, Math.max(0, items.length - 1));
      geometry = dimensions;
      paginate();
    },
  };
}

/** Places callouts without covering their target when another side has enough room. */
const CALLOUT_ANCHOR_GAP = 30;
function positionHint({ hint, viewport, geometry, current, appearance }) {
  const { stageWidth: hintWidth, stageHeight: hintHeight, imageBox } = geometry;
  const offsetX = ((viewport.clientWidth || hintWidth) - hintWidth) / 2;
  const offsetY = ((viewport.clientHeight || hintHeight) - hintHeight) / 2;
  const anchor = current.point ?? current.anchor;
  const point =
    anchor && imageBox
      ? { x: imageBox.x + anchor.x * imageBox.width, y: imageBox.y + anchor.y * imageBox.height }
      : { x: hintWidth / 2, y: hintHeight / 2 };
  if (appearance.presentation !== 'callout')
    return {
      left: offsetX,
      top:
        offsetY +
        (appearance.presentation === 'caption-top'
          ? 0
          : Math.max(0, hintHeight - hint.offsetHeight)),
    };
  let left = (hintWidth - hint.offsetWidth) / 2;
  let top = appearance.presentation === 'caption-top' ? 8 : hintHeight - hint.offsetHeight - 8;
  if (appearance.presentation === 'callout') {
    let placement = appearance.placement ?? 'auto';
    const x = point.x;
    const y = point.y;
    if (placement === 'auto') {
      placement =
        x + CALLOUT_ANCHOR_GAP + hint.offsetWidth <= hintWidth - 8
          ? 'right'
          : x - CALLOUT_ANCHOR_GAP - hint.offsetWidth >= 8
            ? 'left'
            : y + CALLOUT_ANCHOR_GAP + hint.offsetHeight <= hintHeight - 8
              ? 'bottom'
              : 'top';
    }
    left = x + CALLOUT_ANCHOR_GAP;
    top = y - hint.offsetHeight / 2;
    if (placement === 'left') left = x - hint.offsetWidth - CALLOUT_ANCHOR_GAP;
    if (placement === 'top' || placement === 'bottom') {
      left = x - hint.offsetWidth / 2;
      top =
        placement === 'top' ? y - hint.offsetHeight - CALLOUT_ANCHOR_GAP : y + CALLOUT_ANCHOR_GAP;
    }
  }
  return {
    left: offsetX + Math.max(8, Math.min(hintWidth - hint.offsetWidth - 8, left)),
    top: offsetY + Math.max(8, Math.min(hintHeight - hint.offsetHeight - 8, top)),
  };
}
