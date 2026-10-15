import { ActionButton } from './buttons.js';
import { NativeHint } from './layers.js';
export function TextFit({ text, policy = 'end', onClick }) {
  const button = ActionButton({ label: text, onClick }),
    copy = button.querySelector('span');
  button.classList.add('text-fit');
  button.dataset.fit = policy;
  if (policy === 'middle') button.setAttribute('data-no-localize', '');
  copy.className = 'text-fit-copy';
  let clipped = false;
  let tip;
  queueMicrotask(() => {
    tip = NativeHint({ trigger: button, text, shouldShow: () => clipped });
    fit();
  });
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d');
  function fit() {
    const full = button.getAttribute('aria-label'),
      style = getComputedStyle(copy);
    context.font = style.font;
    const width = copy.clientWidth;
    clipped = policy !== 'wrap' && context.measureText(full).width > width;
    if (policy === 'middle' && clipped) {
      const parts =
        typeof Intl.Segmenter === 'function'
          ? [
              ...new Intl.Segmenter(document.documentElement.lang, {
                granularity: 'grapheme',
              }).segment(full),
            ].map((x) => x.segment)
          : Array.from(full);
      let count = parts.length;
      while (count > 0) {
        const lead = Math.ceil(count * 0.55),
          tail = count - lead,
          next = parts.slice(0, lead).join('') + '…' + (tail ? parts.slice(-tail).join('') : '');
        if (context.measureText(next).width <= width) {
          if (copy.textContent !== next) copy.textContent = next;
          break;
        }
        count--;
      }
      if (!count) copy.textContent = '…';
    } else if (copy.textContent !== full) copy.textContent = full;
    button.dataset.truncated = String(clipped);
    tip?.setText(full);
  }
  const observer = new ResizeObserver(fit);
  observer.observe(copy);
  new MutationObserver(fit).observe(button, { attributes: true, attributeFilter: ['aria-label'] });
  document.fonts.ready.then(fit);
  return {
    element: button,
    setText(value) {
      button.setAttribute('aria-label', value);
    },
    fit,
  };
}
