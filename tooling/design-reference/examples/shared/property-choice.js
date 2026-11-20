import { NativeHint } from './native-hint.js';
import { checkGlyph } from './selection.js';
import { createDropdown } from './choices.js';
import { nextChoiceId } from './choice-identity.js';

export function PropertyChoice({
  label,
  options,
  value,
  presentation = 'segments',
  fallbackLabel = 'Выберите значение',
  menuWidth,
  align,
  onChange,
}) {
  const name = nextChoiceId('property-'),
    element = document.createElement('fieldset');
  element.className = 'property-group';
  const legend = document.createElement('legend');
  legend.textContent = label;
  element.append(legend);
  const group = document.createElement('div');
  group.className = 'property-options';
  group.dataset.presentation = presentation;
  const inputs = [];
  let fallback, fitObserver, textObserver;
  const fallbackHost = document.createElement('div');
  fallbackHost.hidden = true;
  fallbackHost.className = 'property-fallback';
  if (presentation === 'segments') group.dataset.propertySegments = '';
  for (const option of options) {
    const row = document.createElement('label');
    row.className = 'property-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.value;
    input.checked = option.value === value;
    input.disabled = !!option.disabled;
    input.setAttribute('aria-label', option.label);
    inputs.push(input);
    const face = document.createElement('span');
    face.className = 'property-face';
    if (presentation === 'segments') face.dataset.segmentFace = '';
    if (presentation === 'tiles') {
      const swatch = document.createElement('span');
      swatch.className = 'property-swatch';
      swatch.style.setProperty('--swatch', option.preview);
      swatch.setAttribute('aria-hidden', 'true');
      face.append(swatch);
      const title = document.createElement('span');
      title.className = 'property-title';
      const text = document.createElement('span');
      text.textContent = option.label;
      const check = document.createElement('span');
      check.className = 'choice-check';
      check.setAttribute('aria-hidden', 'true');
      check.append(checkGlyph());
      title.append(text, check);
      face.append(title);
    } else if (
      presentation === 'tools' ||
      presentation === 'labeled-tools' ||
      presentation === 'icon-segments'
    ) {
      if (option.iconPath) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', option.iconPath);
        svg.append(path);
        face.append(svg);
      }
      const text = document.createElement('span');
      text.textContent = option.label;
      if (!option.iconOnly) face.append(text);
      else {
        row.title = option.label;
        row.dataset.iconOnly = 'true';
        queueMicrotask(() => {
          if (input.isConnected) NativeHint({ trigger: input, text: option.label });
        });
      }
    } else face.textContent = option.label;
    row.append(input, face);
    group.append(row);
    input.addEventListener('change', () => {
      if (input.checked) {
        fallback?.setValue(input.value);
        onChange?.(input.value);
      }
    });
  }
  element.append(group);
  if (presentation === 'segments') element.append(fallbackHost);
  function fit() {
    if (!fallback || !element.isConnected || !element.clientWidth) return;
    if (
      element.contains(document.activeElement) ||
      fallback.trigger.getAttribute('aria-expanded') === 'true'
    )
      return;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    const faces = [...group.querySelectorAll('.property-face')];
    const widths = faces.map((face) => {
      const css = getComputedStyle(face);
      context.font = css.font;
      return Math.max(
        parseFloat(css.minWidth) || 0,
        context.measureText(face.textContent).width +
          parseFloat(css.paddingLeft) +
          parseFloat(css.paddingRight) +
          parseFloat(css.borderLeftWidth) +
          parseFloat(css.borderRightWidth)
      );
    });
    const shell = getComputedStyle(group),
      required =
        widths.reduce((total, width) => total + width, 0) +
        parseFloat(shell.paddingLeft) +
        parseFloat(shell.paddingRight) +
        parseFloat(shell.borderLeftWidth) +
        parseFloat(shell.borderRightWidth) +
        (parseFloat(shell.columnGap) || 0) * (inputs.length - 1);
    const row = element.closest('.parameter-row');
    if (row && row.dataset.label !== 'inherited') {
      const width = row.clientWidth,
        inlineWidth = ((width - 8) * 1.15) / 2.15;
      row.dataset.fit = required > inlineWidth ? 'stacked' : 'inline';
    }
    const compact = required > element.clientWidth;
    group.hidden = compact;
    legend.hidden = compact;
    fallbackHost.hidden = !compact;
    element.dataset.presentation = compact ? 'dropdown' : presentation;
  }
  if (presentation === 'segments')
    queueMicrotask(() => {
      if (!element.isConnected) return;
      fallback = createDropdown(
        fallbackHost,
        label,
        options.map((o, i) => ({
          ...o,
          label: inputs[i].getAttribute('aria-label'),
          disabled: inputs[i].disabled,
        })),
        inputs.find((i) => i.checked)?.value,
        {
          emptyLabel: fallbackLabel,
          menuWidth,
          align,
          onChange: (next) => {
            inputs.forEach((i) => (i.checked = i.value === next));
            onChange?.(next);
          },
        }
      );
      fitObserver = new ResizeObserver(fit);
      fitObserver.observe(element);
      const row = element.closest('.parameter-row');
      if (row) fitObserver.observe(row);
      textObserver = new MutationObserver(() => {
        fallback.setOptions(
          options.map((o, i) => ({
            ...o,
            label: inputs[i].getAttribute('aria-label'),
            disabled: inputs[i].disabled,
          }))
        );
        fit();
      });
      textObserver.observe(group, {
        subtree: true,
        characterData: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-label'],
      });
      element.addEventListener('focusout', () => setTimeout(fit, 0));
      document.fonts.ready.then(fit);
      fit();
    });
  return {
    element,
    inputs,
    get value() {
      return inputs.find((i) => i.checked)?.value;
    },
    setValue(next) {
      inputs.forEach((i) => (i.checked = i.value === next));
      fallback?.setValue(next);
    },
    destroy() {
      fitObserver?.disconnect();
      textObserver?.disconnect();
      fallback?.close();
    },
  };
}
