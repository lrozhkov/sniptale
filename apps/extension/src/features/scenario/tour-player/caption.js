/** One disclosure presentation is shared by editing and every viewing surface. */
export function createTourCaption(hint, text, labels, redraw, signal) {
  const toggle = hint.querySelector('[data-tour-hint-toggle]');
  const title = hint.querySelector('[data-tour-hint-title]');
  const close = hint.querySelector('[data-tour-hint-close]');
  let currentId = null;
  let collapsed = true;
  let enabled = false;
  let long = false;
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
      hint.dataset.collapsed = 'false';
      toggle.hidden = !enabled;
      close.hidden = false;
      text.hidden = false;
      if (title) title.hidden = true;
      toggle.title = labels.details;
    },
    finish() {
      if (!enabled) return;
      const metrics = globalThis.getComputedStyle(text);
      const lineHeight =
        parseFloat(metrics.lineHeight) || (parseFloat(metrics.fontSize) || 14) * 1.5;
      long = text.scrollHeight > lineHeight + 1;
      if (title) title.hidden = true;
      toggle.hidden = !long;
      hint.dataset.captionLong = String(long);
      hint.dataset.collapsed = String(long && collapsed);
      if (long && collapsed) text.style.maxHeight = `${lineHeight}px`;
      text.style.overflowY = long && !collapsed ? 'auto' : 'hidden';
      toggle.setAttribute('aria-expanded', String(!long || !collapsed));
      const action = long && collapsed ? labels.expand : labels.collapse;
      toggle.setAttribute('aria-label', action);
    },
  };
}
