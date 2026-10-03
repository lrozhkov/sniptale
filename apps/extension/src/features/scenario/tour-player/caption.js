/** Compares authored copy by meaning-bearing characters so near-equal labels are detected. */
function normalizeCaptionText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

/** One disclosure presentation is shared by editing and every viewing surface. */
export function createTourCaption(hint, text, labels, redraw, signal) {
  const toggle = hint.querySelector('[data-tour-hint-toggle]');
  const title = hint.querySelector('[data-tour-hint-title]');
  const close = hint.querySelector('[data-tour-hint-close]');
  let currentId = null;
  let collapsed = true;
  let enabled = false;
  let long = false;
  let annotation = false;
  toggle.addEventListener(
    'click',
    () => {
      if (!enabled || !long) return;
      collapsed = !collapsed;
      redraw();
    },
    { signal }
  );
  hint.addEventListener(
    'click',
    (event) => {
      if (!enabled || !long || !collapsed || event.defaultPrevented) return;
      const target = event.target;
      if (
        !(target instanceof hint.ownerDocument.defaultView.Element) ||
        target.closest(
          'button,a,input,select,textarea,label,[role="button"],[role="link"],[contenteditable]'
        )
      )
        return;
      collapsed = false;
      redraw();
    },
    { signal }
  );
  return {
    reset() {
      currentId = null;
      collapsed = true;
    },
    prepare(current, presentation) {
      if (current.id !== currentId) {
        currentId = current.id;
        collapsed = true;
      }
      enabled = presentation !== 'callout';
      annotation = !current.point;
      hint.dataset.collapsed = 'false';
      toggle.hidden = !enabled;
      close.hidden = enabled;
      text.hidden = false;
      title.textContent = captionTitle(current, labels.details);
      toggle.title = title.textContent;
    },
    finish() {
      if (!enabled) return;
      const voice = hint.querySelector('[data-tour-narration]:not([hidden])');
      hint.hidden = annotation && !text.textContent.trim() && !voice;
      const metrics = globalThis.getComputedStyle(text);
      const lineHeight =
        parseFloat(metrics.lineHeight) || (parseFloat(metrics.fontSize) || 14) * 1.5;
      long = text.scrollHeight > lineHeight + 1;
      title.hidden = !long;
      toggle.hidden = !long;
      hint.dataset.captionLong = String(long);
      hint.dataset.collapsed = String(long && collapsed);
      if (long && collapsed) text.style.maxHeight = `${lineHeight}px`;
      text.style.overflowY = long && !collapsed ? 'auto' : 'hidden';
      toggle.setAttribute('aria-expanded', String(!long || !collapsed));
      const action = long && collapsed ? labels.expand : labels.collapse;
      toggle.setAttribute('aria-label', `${action}: ${title.textContent}`);
    },
  };
}

/** A repeated body prefix is not a separate explanation title. */
function captionTitle(current, fallback) {
  const label = normalizeCaptionText(current.label);
  const body = normalizeCaptionText(current.text);
  const repeatsBody = body && (label === body || body.startsWith(`${label} `));
  return (label && body && !repeatsBody ? current.label : '') || fallback;
}
