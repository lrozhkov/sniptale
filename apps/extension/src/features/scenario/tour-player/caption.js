/** Compares authored copy by meaning-bearing characters so near-equal labels are detected. */
function normalizeCaptionText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

/** A caption's disclosure state belongs to the current explanation, never the saved tour. */
export function createTourCaption(hint, text, labels, redraw, signal, compact = false) {
  if (compact) return createCompactTourCaption(hint, text, labels, redraw, signal);
  const toggle = hint.querySelector('[data-tour-hint-toggle]');
  const title = hint.querySelector('[data-tour-hint-title]');
  const close = hint.querySelector('[data-tour-hint-close]');
  let currentId = null;
  let collapsed = false;
  let enabled = false;
  toggle.addEventListener(
    'click',
    () => {
      collapsed = !collapsed;
      redraw();
    },
    { signal }
  );
  return {
    reset() {
      currentId = null;
      collapsed = false;
    },
    prepare(current, presentation) {
      if (current.id !== currentId) {
        currentId = current.id;
        collapsed = false;
      }
      enabled = presentation !== 'callout';
      toggle.hidden = !enabled;
      close.hidden = enabled;
      text.hidden = false;
      hint.dataset.collapsed = 'false';
      // The heading is semantic: authored label when it is distinct from the body copy it
      // discloses, else a fixed label — whitespace, case and punctuation do not make it distinct.
      const label = normalizeCaptionText(current.label);
      const body = normalizeCaptionText(current.text);
      const repeatsBody = body && (label === body || body.startsWith(`${label} `));
      const heading = (label && body && !repeatsBody ? current.label : '') || labels.details;
      title.textContent = heading;
      toggle.title = heading;
    },
    finish() {
      text.hidden = enabled && collapsed;
      hint.dataset.collapsed = String(enabled && collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      const action = collapsed ? labels.expand : labels.collapse;
      toggle.setAttribute('aria-label', `${action}: ${title.textContent}`);
    },
  };
}

/** Editor disclosure measures the full copy and never changes its saved text. */
function createCompactTourCaption(hint, text, labels, redraw, signal) {
  const toggle = hint.querySelector('[data-tour-hint-toggle]');
  const title = hint.querySelector('[data-tour-hint-title]');
  const close = hint.querySelector('[data-tour-hint-close]');
  let currentId = null;
  let collapsed = true;
  let enabled = false;
  let annotation = false;
  toggle.addEventListener(
    'click',
    () => {
      collapsed = !collapsed;
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
      hint.dataset.compact = String(enabled);
      hint.dataset.collapsed = 'false';
      title.hidden = true;
      // Keep the disclosure focused while measuring copy without its grid column.
      toggle.hidden = !enabled;
      toggle.style.position = enabled ? 'absolute' : '';
      close.hidden = enabled;
      text.hidden = false;
    },
    finish() {
      if (!enabled) return;
      hint.style.borderRadius = '0';
      hint.hidden = annotation && !text.textContent.trim();
      const metrics = globalThis.getComputedStyle(text);
      const lineHeight =
        parseFloat(metrics.lineHeight) || (parseFloat(metrics.fontSize) || 14) * 1.5;
      const long = text.scrollHeight > lineHeight + 1;
      toggle.style.position = '';
      toggle.hidden = !long;
      hint.dataset.collapsed = String(long && collapsed);
      toggle.setAttribute('aria-expanded', String(!long || !collapsed));
      const action = long && collapsed ? labels.expand : labels.collapse;
      toggle.setAttribute('aria-label', action);
      toggle.title = action;
    },
  };
}
