/** Compares authored copy by meaning-bearing characters so near-equal labels are detected. */
function normalizeCaptionText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

/** A caption's disclosure state belongs to the current explanation, never the saved tour. */
export function createTourCaption(hint, text, labels, redraw, signal) {
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
