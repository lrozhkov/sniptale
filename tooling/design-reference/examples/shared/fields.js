import { bindSelectAllOnFocus } from './input-selection.js';
import { el } from './dom.js';
import { bindFieldLabel } from './field-label.js';
import { ActionButton } from './buttons.js';
let serial = 0;
export function TextField({
  label,
  value = '',
  placeholder = '',
  multiline = false,
  context = 'form',
  readOnly = false,
  disabled = false,
  mixed = false,
  description = '',
  clearable = true,
  clearLabel,
  selectOnFocus = false,
  validate = () => '',
  onPreview,
  onCommit,
}) {
  const id = 'text-reference-' + ++serial;
  let accepted = value,
    dirty = false;
  const input = el(multiline ? 'textarea' : 'input', {
    id,
    class: 'text-input',
    placeholder: mixed ? 'Разные значения' : placeholder,
  });
  if (!multiline) input.type = 'text';
  input.value = value ?? '';
  input.readOnly = readOnly;
  input.disabled = disabled;
  const error = el('p', { class: 'field-error', id: id + '-error', role: 'alert' }),
    help = el('p', { class: 'field-description', id: id + '-help', text: description });
  input.setAttribute('aria-describedby', id + '-help ' + id + '-error');
  const element = el(
    'div',
    { class: 'text-field', 'data-context': context, 'data-readonly': String(readOnly) },
    [el('label', { for: id, class: 'text-label', text: label }), input, help, error]
  );
  const clear = clearable
    ? ActionButton({
        label: clearLabel || 'Очистить поле «' + label + '»',
        kind: 'utility',
        appearance: 'chrome',
        iconOnly: true,
        iconPath: 'M6 6 L18 18 M18 6 L6 18',
        onClick: () => {
          if (input.disabled || input.readOnly) return;
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus({ preventScroll: true });
          input.setSelectionRange(0, 0);
        },
      })
    : null;
  if (clear) {
    clear.classList.add('text-clear');
    element.classList.add('text-field--clearable');
    clear.addEventListener('pointerdown', (event) => {
      if (event.button === 0) event.preventDefault();
    });
    input.after(clear);
    new MutationObserver(syncClear).observe(input, {
      attributes: true,
      attributeFilter: ['disabled', 'readonly'],
    });
  }
  function syncClear() {
    if (clear) {
      clear.hidden = !input.value || input.disabled || input.readOnly;
      clear.disabled = input.disabled || input.readOnly;
    }
  }
  syncClear();
  bindFieldLabel(element.querySelector('label'), input);
  function check() {
    const message = validate(input.value);
    error.textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    return !message;
  }
  function commit() {
    if (!dirty) return true;
    if (!check()) return false;
    if (accepted !== input.value) {
      accepted = input.value;
      input.placeholder = placeholder;
      onCommit?.(accepted);
    }
    dirty = false;
    return true;
  }
  function cancel() {
    input.value = accepted ?? '';
    dirty = false;
    input.placeholder = accepted === null ? 'Разные значения' : placeholder;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    onPreview?.(accepted);
    syncClear();
  }
  if (selectOnFocus) bindSelectAllOnFocus(input);
  input.addEventListener('input', () => {
    dirty = true;
    syncClear();
    if (error.textContent) check();
    onPreview?.(input.value);
  });
  if (context === 'inspector') {
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        input.blur();
      } else if (event.key === 'Enter' && !multiline) {
        event.preventDefault();
        if (commit()) input.blur();
      }
    });
  }
  return {
    element,
    input,
    error,
    clear,
    validate: check,
    commit,
    cancel,
    get value() {
      return accepted;
    },
    get draft() {
      return input.value;
    },
    setValue(next) {
      accepted = next;
      cancel();
    },
  };
}
