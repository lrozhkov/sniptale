function measureHintPages(hintText, fullText) {
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

export function createTourHints(root, defaultAppearance, { onClose, focusTrigger }) {
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const viewport = query('viewport');
  const hint = query('hint');
  const hintText = query('hint-text');
  const hintCount = query('hint-count');
  const hintPrevious = query('hint-previous');
  const hintNext = query('hint-next');
  const hintClose = query('hint-close');
  let activeHint = 0;
  let textPage = 0;
  let pages = [];
  let hints = [];
  let dismissed = false;
  let restoringFocus = false;
  let geometry = { stageWidth: 640, stageHeight: 360, imageBox: null };
  function paginate() {
    const { stageWidth, stageHeight, imageBox } = geometry;
    const current = dismissed ? null : hints[activeHint];
    if (!current) {
      hint.hidden = true;
      return;
    }
    hint.hidden = false;
    const authoredAppearance = current.appearance ?? defaultAppearance;
    const appearance =
      stageWidth < 480 && authoredAppearance.presentation === 'callout'
        ? { ...authoredAppearance, presentation: 'caption-bottom' }
        : authoredAppearance;
    const hintWidth = viewport.clientWidth || stageWidth;
    const hintHeight = viewport.clientHeight || stageHeight;
    const offsetX = (hintWidth - stageWidth) / 2;
    const offsetY = (hintHeight - stageHeight) / 2;
    hint.dataset.presentation = appearance.presentation;
    hint.style.textAlign = appearance.alignment;
    const maximumHeight = Math.max(90, Math.min(200, hintHeight - 16));
    hint.style.setProperty('--hint-height', `${maximumHeight}px`);
    const preferredWidth = appearance.presentation === 'callout' ? 340 : hintWidth - 16;
    hint.style.width = `${Math.max(100, Math.min(hintWidth - 16, preferredWidth))}px`;
    pages = measureHintPages(hintText, current.text || current.label || '');
    textPage = Math.min(textPage, pages.length - 1);
    hintText.textContent = pages[textPage];
    hintCount.textContent = `${activeHint + 1}/${hints.length} · ${textPage + 1}/${pages.length}`;
    hintPrevious.disabled = activeHint === 0 && textPage === 0;
    hintNext.disabled = activeHint === hints.length - 1 && textPage === pages.length - 1;
    const anchor = current.point ?? current.anchor;
    const point =
      anchor && imageBox
        ? { x: imageBox.x + anchor.x * imageBox.width, y: imageBox.y + anchor.y * imageBox.height }
        : { x: stageWidth / 2, y: stageHeight / 2 };
    let left = (hintWidth - hint.offsetWidth) / 2;
    let top = appearance.presentation === 'caption-top' ? 8 : hintHeight - hint.offsetHeight - 8;
    if (appearance.presentation === 'callout') {
      const placement = appearance.placement ?? 'auto';
      const x = offsetX + point.x;
      const y = offsetY + point.y;
      left = x + 22;
      top = y - hint.offsetHeight / 2;
      if (placement === 'left' || (placement === 'auto' && left + hint.offsetWidth > hintWidth - 8))
        left = x - hint.offsetWidth - 22;
      if (placement === 'top' || placement === 'bottom') {
        left = x - hint.offsetWidth / 2;
        top = placement === 'top' ? y - hint.offsetHeight - 22 : y + 22;
      }
    }
    hint.style.left = `${Math.max(8, Math.min(hintWidth - hint.offsetWidth - 8, left))}px`;
    hint.style.top = `${Math.max(8, Math.min(hintHeight - hint.offsetHeight - 8, top))}px`;
  }
  function changeHint(direction) {
    if (direction > 0 && textPage + 1 < pages.length) textPage += 1;
    else if (direction < 0 && textPage > 0) textPage -= 1;
    else if (activeHint + direction >= 0 && activeHint + direction < hints.length) {
      activeHint += direction;
      textPage = 0;
    }
    paginate();
  }
  hintPrevious.addEventListener('click', () => changeHint(-1));
  hintNext.addEventListener('click', () => changeHint(1));
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
  hintClose.addEventListener('click', dismiss);
  root.ownerDocument.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || query('navigation').open || hint.hidden)
      return;
    event.preventDefault();
    dismiss();
  });
  return {
    get activeIndex() {
      return activeHint;
    },
    reset() {
      activeHint = 0;
      textPage = 0;
      dismissed = false;
    },
    select(index) {
      if (restoringFocus) return;
      activeHint = index;
      textPage = 0;
      dismissed = false;
      paginate();
    },
    show(items, dimensions) {
      hints = items;
      geometry = dimensions;
      paginate();
    },
  };
}
