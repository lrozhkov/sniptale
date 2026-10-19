import { createTourCaption } from './caption.js';
import {
  resolveTourTextAppearance,
  tourTextDefaults,
} from '@sniptale/runtime-contracts/scenario/types/tour';
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
  defaultStyle,
  { onClose, focusTrigger, signal, keyboardScope, labels, navigation, boundary }
) {
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const viewport = query('viewport');
  const hint = query('hint');
  const hintText = query('hint-text');
  const hintPrevious = query('hint-previous');
  const hintNext = query('hint-next');
  const visibilityToggle = query('hints');
  let activeHint = 0;
  let activeHintId = null;
  let textPage = 0;
  let pages = [];
  let hints = [];
  let persistent = true;
  let targetPointer = false;
  let targetFocus = false;
  let hintPointer = false;
  let hintFocus = false;
  let suppressed = false;
  let leaveTimer;
  function clearLeave() {
    clearTimeout(leaveTimer);
  }
  function updateToggle() {
    if (!visibilityToggle) return;
    visibilityToggle.setAttribute('aria-pressed', String(persistent));
    const label = persistent ? labels.hideHints : labels.showHints;
    visibilityToggle.setAttribute('aria-label', label ?? labels.details);
    visibilityToggle.title = label ?? labels.details;
  }
  function leave() {
    clearLeave();
    leaveTimer = setTimeout(paginate, 180);
  }
  visibilityToggle?.addEventListener(
    'click',
    () => {
      persistent = !persistent;
      targetPointer = targetFocus = hintPointer = hintFocus = false;
      suppressed = false;
      updateToggle();
      paginate();
    },
    { signal }
  );
  hint.addEventListener(
    'pointerenter',
    () => {
      clearLeave();
      hintPointer = true;
      paginate();
    },
    { signal }
  );
  hint.addEventListener(
    'pointerleave',
    () => {
      hintPointer = false;
      leave();
    },
    { signal }
  );
  hint.addEventListener(
    'focusin',
    () => {
      hintFocus = true;
      paginate();
    },
    { signal }
  );
  hint.addEventListener(
    'focusout',
    (event) => {
      if (hint.contains(event.relatedTarget)) return;
      hintFocus = false;
      leave();
    },
    { signal }
  );
  signal.addEventListener('abort', clearLeave, { once: true });
  updateToggle();
  let restoringFocus = false;
  const caption = createTourCaption(hint, hintText, labels, paginate, signal);
  let geometry = { stageWidth: 640, stageHeight: 360, imageBox: null };
  function paginate() {
    const { stageWidth, stageHeight } = geometry;
    const revealed = !suppressed && (targetPointer || targetFocus || hintPointer || hintFocus);
    const current = persistent || revealed ? hints[activeHint] : null;
    if (!current) {
      hint.hidden = true;
      return;
    }
    activeHintId = current.id;
    hint.hidden = false;
    const defaultAppearance = tourTextDefaults(
      defaultStyle,
      current.point ? 'hotspot' : 'annotation'
    );
    const appearance = resolveTourTextAppearance(
      current.point ? 'hotspot' : 'annotation',
      current.appearance,
      defaultAppearance
    );
    hint.dataset.presentation = appearance.presentation;
    caption.prepare(current, appearance.presentation);
    const copy = setTourHintCopy(current);
    const surface = applyTourHintSurface(hint, appearance.surface ?? defaultAppearance.surface);
    hint.style.textAlign = appearance.alignment;
    sizeTourHint({ hint, hintText, surface, appearance, stageWidth, stageHeight });
    pages = [copy.text];
    textPage = Math.min(textPage, pages.length - 1);
    hintText.textContent = pages[textPage];
    updateTourHintNavigation(hint, {
      index: activeHint,
      count: hints.length,
      page: textPage,
      pages: pages.length,
      pointLabel: labels.point,
      position: boundary?.position(activeHint),
      previousAvailable: boundary?.canMove(-1),
      nextAvailable: boundary?.canMove(1),
    });
    if (navigation) {
      hintPrevious.disabled = !navigation.canMove(-1);
      hintNext.disabled = !navigation.canMove(1);
    }
    caption.finish();
    hintText.hidden = hintText.hidden || copy.hideBody;
    const position = positionHint({ hint, viewport, geometry, current, appearance });
    avoidTourToolbar(root, viewport, hint, position, appearance.presentation, (availableHeight) => {
      sizeTourHint({
        hint,
        hintText,
        surface,
        appearance,
        stageWidth,
        stageHeight,
        availableHeight,
      });
      caption.finish();
      return positionHint({ hint, viewport, geometry, current, appearance });
    });
    hint.style.left = `${position.left}px`;
    const bottomCaption = appearance.presentation === 'caption-bottom';
    hint.style.top = bottomCaption ? 'auto' : `${position.top}px`;
    hint.style.bottom = bottomCaption ? `${position.bottom}px` : '';
  }
  function changeHint(direction) {
    if (navigation) {
      navigation.move(direction);
      return;
    }
    if (boundary?.canMove(direction)) {
      boundary.move(direction);
      return;
    }
    if (direction > 0 && textPage + 1 < pages.length) textPage += 1;
    else if (direction < 0 && textPage > 0) textPage -= 1;
    else if (activeHint + direction >= 0 && activeHint + direction < hints.length) {
      activeHint += direction;
      textPage = direction < 0 ? Number.MAX_SAFE_INTEGER : 0;
    } else if (boundary?.canMove(direction)) {
      boundary.move(direction);
      return;
    }
    paginate();
  }
  hintPrevious.addEventListener('click', () => changeHint(-1), { signal });
  hintNext.addEventListener('click', () => changeHint(1), { signal });
  function dismiss() {
    if (hint.hidden) return;
    persistent = false;
    suppressed = true;
    targetPointer = targetFocus = hintPointer = hintFocus = false;
    clearLeave();
    updateToggle();
    hint.hidden = true;
    onClose();
    restoringFocus = true;
    try {
      focusTrigger(activeHint);
    } finally {
      restoringFocus = false;
    }
  }
  bindTourHintDismissal(root, hint, signal, keyboardScope, dismiss);
  return {
    /** Viewer targets reveal the current explanation without issuing navigation commands. */
    bindTarget(target, index) {
      target.addEventListener(
        'pointerenter',
        () => {
          if (index !== activeHint || suppressed) return;
          clearLeave();
          targetPointer = true;
          paginate();
        },
        { signal }
      );
      target.addEventListener(
        'pointerleave',
        () => {
          targetPointer = false;
          suppressed = false;
          leave();
        },
        { signal }
      );
      target.addEventListener(
        'focus',
        () => {
          if (index !== activeHint || suppressed || restoringFocus) return;
          clearLeave();
          targetFocus = true;
          paginate();
        },
        { signal }
      );
      target.addEventListener(
        'blur',
        () => {
          targetFocus = false;
          suppressed = false;
          leave();
        },
        { signal }
      );
    },
    reflow: paginate,
    setDefaultAppearance(value) {
      defaultStyle = value;
    },
    get activeIndex() {
      return activeHint;
    },
    reset(sameScene = false) {
      if (sameScene && hint.dataset.presentation !== 'callout') return;
      clearLeave();
      caption.reset();
      activeHintId = null;
      activeHint = 0;
      textPage = 0;
      targetPointer = targetFocus = hintPointer = hintFocus = false;
      suppressed = false;
    },
    select(index, lastPage = false) {
      if (restoringFocus) return;
      if (navigation) {
        persistent = true;
        suppressed = false;
        updateToggle();
      }
      if (lastPage || hints[index]?.id !== activeHintId || hint.dataset.presentation === 'callout')
        textPage = lastPage ? Number.MAX_SAFE_INTEGER : 0;
      activeHint = index;
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

function setTourHintCopy(current) {
  const hotspot = Boolean(current.point);
  return {
    text: hotspot ? current.text || '' : current.text || current.label || '',
    hideBody: hotspot && !current.text?.trim(),
  };
}

/** Keep the explanation clear of the floating controls without resizing the stage. */
function avoidTourToolbar(root, viewport, hint, position, presentation, fit) {
  const toolbar = root.querySelector('.tour-toolbar');
  if (!toolbar) return;
  const controls = toolbar.getBoundingClientRect();
  if (!controls.width || !controls.height) return;
  const bounds = viewport.getBoundingClientRect();
  const left = controls.left - bounds.left;
  const top = controls.top - bounds.top;
  const captionBottom = presentation === 'caption-bottom';
  let hintTop = captionBottom ? bounds.height - position.bottom - hint.offsetHeight : position.top;
  if (
    position.left + hint.offsetWidth <= left ||
    position.left >= left + controls.width ||
    hintTop + hint.offsetHeight + 8 <= top ||
    hintTop >= top + controls.height + 8
  )
    return;
  const minimumTop = presentation === 'callout' ? 8 : 0;
  const availableHeight = Math.max(1, top - 8 - minimumTop);
  if (hint.offsetHeight > availableHeight) {
    Object.assign(position, fit(availableHeight));
    hintTop = captionBottom ? bounds.height - position.bottom - hint.offsetHeight : position.top;
  }
  const shift = hintTop + hint.offsetHeight + 8 - top;
  if (captionBottom) position.bottom += shift;
  else position.top = Math.max(8, position.top - shift);
}

/** Places callouts without covering their target when another side has enough room. */
function positionHint({ hint, viewport, geometry, current, appearance }) {
  const gap = appearance.calloutGap ?? 30;
  const { stageWidth: hintWidth, stageHeight: hintHeight, imageBox } = geometry;
  const offsetX = ((viewport.clientWidth || hintWidth) - hintWidth) / 2;
  const offsetY = ((viewport.clientHeight || hintHeight) - hintHeight) / 2;
  const rect = current.visual?.kind !== 'point' ? current.visual?.rect : null;
  const anchor = rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : current.point;
  const point =
    anchor && imageBox
      ? { x: imageBox.x + anchor.x * imageBox.width, y: imageBox.y + anchor.y * imageBox.height }
      : { x: hintWidth / 2, y: hintHeight / 2 };
  if (appearance.presentation !== 'callout')
    return {
      left: offsetX,
      bottom: offsetY,
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
    const halfWidth = rect && imageBox ? (rect.width * imageBox.width) / 2 : 0;
    const halfHeight = rect && imageBox ? (rect.height * imageBox.height) / 2 : 0;
    if (placement === 'auto') {
      placement =
        x + halfWidth + gap + hint.offsetWidth <= hintWidth - 8
          ? 'right'
          : x - halfWidth - gap - hint.offsetWidth >= 8
            ? 'left'
            : y + halfHeight + gap + hint.offsetHeight <= hintHeight - 8
              ? 'bottom'
              : 'top';
    }
    left = x + halfWidth + gap;
    top = y - hint.offsetHeight / 2;
    if (placement === 'left') left = x - halfWidth - hint.offsetWidth - gap;
    if (placement === 'top' || placement === 'bottom') {
      left = x - hint.offsetWidth / 2;
      top = placement === 'top' ? y - halfHeight - hint.offsetHeight - gap : y + halfHeight + gap;
    }
  }
  return {
    left: offsetX + Math.max(8, Math.min(hintWidth - hint.offsetWidth - 8, left)),
    top: offsetY + Math.max(8, Math.min(hintHeight - hint.offsetHeight - 8, top)),
  };
}

/** Escape and Close share dismissal admission and the mounted hint lifetime. */
function bindTourHintDismissal(root, hint, signal, keyboardScope, dismiss) {
  hint.querySelector('[data-tour-hint-close]').addEventListener('click', dismiss, { signal });
  root.ownerDocument.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        (keyboardScope && !event.composedPath().includes(keyboardScope)) ||
        root.querySelector('[data-tour-navigation]').open ||
        hint.hidden
      )
        return;
      event.preventDefault();
      dismiss();
    },
    { signal }
  );
}
