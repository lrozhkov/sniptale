import { el } from './dom.js';
export function ParameterRow({ label, content, layout = 'inline', showLabel = true }) {
  const name = el('span', { class: 'parameter-name', text: label }),
    value = el('div', { class: 'parameter-value' }, content),
    element = el(
      'div',
      {
        class: 'parameter-row',
        'data-layout': layout,
        'data-label': showLabel ? 'visible' : 'inherited',
      },
      [name, value]
    );
  name.hidden = !showLabel;
  let observer, changes;
  function fit() {
    if (
      !showLabel ||
      layout === 'stacked' ||
      !element.isConnected ||
      !element.clientWidth ||
      element.contains(document.activeElement) ||
      value.querySelector('[aria-expanded=true]')
    )
      return;
    const ctx = document.createElement('canvas').getContext('2d'),
      style = getComputedStyle(name),
      width = element.clientWidth;
    ctx.font = style.font;
    const nameWidth = ctx.measureText(name.textContent).width,
      inlineName = (width - 8) / 2.15;
    const current = value.querySelector('.choice-field .control .value');
    let valueTooWide = false;
    if (current) {
      ctx.font = getComputedStyle(current).font;
      const control = current.closest('.control'),
        css = getComputedStyle(control),
        arrow = control.querySelector('.chevron'),
        chrome =
          parseFloat(css.paddingLeft) +
          parseFloat(css.paddingRight) +
          parseFloat(css.borderLeftWidth) +
          parseFloat(css.borderRightWidth) +
          (parseFloat(css.columnGap) || 0) +
          (arrow?.getBoundingClientRect().width || 0);
      valueTooWide =
        ctx.measureText(current.textContent).width + chrome > ((width - 8) * 1.15) / 2.15;
    }
    element.dataset.labelFit = nameWidth > inlineName || valueTooWide ? 'stacked' : 'inline';
  }
  queueMicrotask(() => {
    if (!element.isConnected) return;
    observer = new ResizeObserver(fit);
    observer.observe(element);
    changes = new MutationObserver(fit);
    changes.observe(name, { subtree: true, characterData: true, childList: true });
    changes.observe(value, { subtree: true, characterData: true, childList: true });
    document.fonts.ready.then(fit);
    element.addEventListener('focusout', () => setTimeout(fit, 0));
    fit();
  });
  return {
    element,
    name,
    value,
    destroy() {
      observer?.disconnect();
      changes?.disconnect();
    },
  };
}
