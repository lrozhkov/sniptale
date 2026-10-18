import { el } from './dom.js';
let serial = 0;
const densityClass = (value) => (value === 'compact' ? 'sm' : value === 'spacious' ? 'lg' : '');
export function checkGlyph() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M3 7.5 L6.5 11 L13 4.5');
  svg.append(path);
  return svg;
}
export function Checkbox({
  label,
  checked = false,
  mixed = false,
  disabled = false,
  density = 'default',
  description = '',
  layout = 'selection',
  tone = 'accent',
  onChange,
}) {
  const id = 'reference-checkbox-' + ++serial;
  const input = el('input', { type: 'checkbox', 'aria-labelledby': id + '-label' });
  input.checked = checked;
  input.indeterminate = mixed;
  input.disabled = disabled;
  const disc = el('span', { class: 'check-disc', 'aria-hidden': 'true' }, checkGlyph()),
    hit = el('span', { class: 'check-hit ' + densityClass(density) }, [input, disc]);
  const copy = el('span', { class: 'option-copy' }, [
    el('span', { class: 'option-label', id: id + '-label', text: label }),
    ...(description
      ? [el('span', { class: 'option-description', id: id + '-description', text: description })]
      : []),
  ]);
  if (description) input.setAttribute('aria-describedby', id + '-description');
  const element = el(
    'label',
    {
      class: 'selection-option',
      'data-density': density,
      'data-layout': layout,
      'data-tone': tone,
    },
    layout === 'parameter' ? [copy, hit] : [hit, copy]
  );
  input.addEventListener('change', () => onChange?.(input.checked));
  return {
    element,
    input,
    setState(next) {
      if ('checked' in next) input.checked = next.checked;
      if ('mixed' in next) input.indeterminate = next.mixed;
      if ('disabled' in next) input.disabled = next.disabled;
    },
    get value() {
      return input.checked;
    },
  };
}
export function RadioGroup({ label, options, value, density = 'default', onChange }) {
  const name = 'reference-radio-' + ++serial,
    element = el('fieldset', { class: 'selection-group' }, el('legend', { text: label })),
    inputs = [];
  for (const option of options) {
    const input = el('input', { type: 'radio', name, value: option.value });
    input.checked = option.value === value;
    input.disabled = !!option.disabled;
    inputs.push(input);
    input.addEventListener('change', () => {
      if (input.checked) onChange?.(option.value);
    });
    element.append(
      el('label', { class: 'selection-option', 'data-density': density }, [
        el('span', { class: 'check-hit ' + densityClass(density) }, [
          input,
          el(
            'span',
            { class: 'check-disc radio-disc', 'aria-hidden': 'true' },
            el('span', { class: 'radio-dot' })
          ),
        ]),
        el('span', { class: 'option-copy', text: option.label }),
      ])
    );
  }
  return {
    element,
    inputs,
    get value() {
      return inputs.find((input) => input.checked)?.value;
    },
    setValue(next) {
      for (const input of inputs) input.checked = input.value === next;
    },
  };
}
export function Switch({
  label,
  checked = false,
  disabled = false,
  density = 'default',
  onChange,
}) {
  const button = el('button', {
    type: 'button',
    class: 'switch ' + densityClass(density),
    role: 'switch',
    'aria-label': label,
    'aria-checked': String(checked),
  });
  button.disabled = disabled;
  const status = el('div', { class: 'selection-status', role: 'status' }),
    retry = el('button', { type: 'button', class: 'selection-retry', text: 'Повторить' });
  retry.hidden = true;
  let busy = false;
  const element = el('div', {}, [
    el('div', { class: 'selection-setting', 'data-density': density }, [
      el('span', { text: label }),
      button,
    ]),
    status,
    retry,
  ]);
  async function apply() {
    if (disabled || busy) return;
    const next = button.getAttribute('aria-checked') !== 'true';
    try {
      const result = onChange?.(next);
      if (result && typeof result.then === 'function') {
        busy = true;
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-disabled', 'true');
        status.setAttribute('role', 'status');
        status.textContent = 'Применение…';
        retry.setAttribute('aria-disabled', 'true');
        await result;
      }
      button.setAttribute('aria-checked', String(next));
      status.setAttribute('role', 'status');
      status.textContent = '';
      if (document.activeElement === retry) button.focus();
      retry.hidden = true;
    } catch {
      status.setAttribute('role', 'alert');
      status.textContent = 'Не удалось применить. Подтверждённое состояние сохранено.';
      retry.hidden = false;
    } finally {
      busy = false;
      button.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
      retry.removeAttribute('aria-disabled');
    }
  }
  button.addEventListener('click', apply);
  retry.addEventListener('click', apply);
  return {
    element,
    button,
    setValue(next) {
      button.setAttribute('aria-checked', String(next));
    },
    get value() {
      return button.getAttribute('aria-checked') === 'true';
    },
  };
}

export function FilterCheckbox({ label, count = 0, ...props }) {
  const control = Checkbox({ ...props, label, tone: 'neutral' });
  control.element.classList.add('filter-checkbox');
  const text = control.element.querySelector('.option-label');
  text.classList.add('filter-label');
  text.replaceChildren(
    el('span', { class: 'filter-name', text: label }),
    el('span', { class: 'filter-name-width', 'aria-hidden': 'true', text: label })
  );
  control.element
    .querySelector('.option-copy')
    .append(el('span', { class: 'filter-count', 'aria-hidden': 'true', text: String(count) }));
  return control;
}
