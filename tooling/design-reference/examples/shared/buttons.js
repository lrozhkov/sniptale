import { el } from './dom.js';
import { checkGlyph } from './selection.js';
import './button-press.js';
export function icon(path) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(svg.namespaceURI, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}
export function ActionButton({
  label,
  kind = 'secondary',
  density = 'compact',
  iconPath,
  iconOnly = false,
  disabled = false,
  onClick,
  type = 'button',
  surface,
  pressFeedback = true,
  appearance = 'command',
  menuIndicator = false,
}) {
  const button = el('button', {
    type,
    class: 'action-button',
    'data-kind': kind,
    'data-appearance': appearance,
    'data-density': density,
    'data-surface': surface || (kind === 'primary' ? 'filled' : 'quiet'),
    'data-press-feedback': pressFeedback ? 'on' : 'off',
    'aria-label': label,
  });
  button.disabled = disabled;
  if (menuIndicator) button.dataset.menuIndicator = 'true';
  if (iconPath) button.append(icon(iconPath));
  if (!iconOnly) button.append(el('span', { text: label }));
  else {
    button.classList.add('icon-action');
    button.title = label;
  }
  if (onClick) button.addEventListener('click', onClick);
  return button;
}
export function PressedButton({
  label,
  pressed = false,
  onChange,
  iconPath,
  iconOnly = false,
  density = 'compact',
  showMark = true,
  appearance = 'mode',
}) {
  const button = ActionButton({
    label,
    iconPath,
    iconOnly,
    density,
    appearance,
    kind: iconOnly ? 'utility' : 'secondary',
  });
  button.classList.add('pressed-action');
  button.setAttribute('aria-pressed', String(pressed));
  const mark = el('span', { class: 'button-check', 'aria-hidden': 'true' }, checkGlyph());
  if (showMark && !iconPath) button.prepend(mark);
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(next));
    onChange?.(next);
  });
  return button;
}
export function AsyncCommand({ label, action }) {
  const button = ActionButton({ label, kind: 'primary' }),
    status = el('p', { class: 'action-status', role: 'status' }),
    retry = ActionButton({ label: 'Повторить' }),
    element = el('div', {}, [button, status, retry]);
  retry.hidden = true;
  let pending = false;
  async function run() {
    if (pending) return;
    pending = true;
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    retry.setAttribute('aria-disabled', 'true');
    status.setAttribute('role', 'status');
    status.textContent = 'Выполнение…';
    try {
      await action();
      status.textContent = 'Готово';
      if (document.activeElement === retry) button.focus();
      retry.hidden = true;
    } catch {
      status.setAttribute('role', 'alert');
      status.textContent = 'Не удалось выполнить. Данные сохранены. Повторите попытку.';
      retry.hidden = false;
    } finally {
      pending = false;
      button.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
      retry.removeAttribute('aria-disabled');
    }
  }
  button.addEventListener('click', run);
  retry.addEventListener('click', run);
  return { element, button, retry };
}

export function ButtonToolbar({ label, buttons }) {
  const element = el(
    'div',
    { class: 'button-toolbar', role: 'toolbar', 'aria-label': label },
    buttons
  );
  const enabled = () => buttons.filter((b) => !b.disabled && !b.hidden);
  function focus(button) {
    for (const b of buttons) b.tabIndex = b === button ? 0 : -1;
  }
  focus(enabled()[0]);
  for (const button of buttons) {
    button.addEventListener('focus', () => focus(button));
    button.addEventListener('keydown', (event) => {
      const list = enabled(),
        index = list.indexOf(button);
      let next;
      if (event.key === 'Home') next = list[0];
      else if (event.key === 'End') next = list.at(-1);
      else if (event.key === 'ArrowLeft') next = list[(index - 1 + list.length) % list.length];
      else if (event.key === 'ArrowRight') next = list[(index + 1) % list.length];
      if (next) {
        event.preventDefault();
        focus(next);
        next.focus();
      }
    });
  }
  return { element, buttons };
}
