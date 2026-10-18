import { el } from './dom.js';
import { ActionButton, icon } from './buttons.js';
import { checkGlyph } from './selection.js';
import { claimFloating, releaseFloating } from './floating-owner.js';
import { nextLayerId } from './layer-identity.js';

// Panel-owned recording curtain; this is distinct from a floating value list.
export function InlineCurtain({
  label,
  description = '',
  options = [],
  value,
  settings = [],
  footer = [],
  load,
  onChange,
}) {
  const id = nextLayerId('reference-curtain-');
  let selected = value,
    mode = null,
    origin = null,
    loading = false,
    error = '',
    revision = 0;
  const inertBefore = new Map();
  const title = el('span', { class: 'curtain-name', text: label }),
    current = el('span', { class: 'curtain-value', id: id + '-value' }),
    trigger = ActionButton({ label, kind: 'quiet' });
  trigger.replaceChildren(title, current, icon('M5 9 L12 15 L19 9'));
  trigger.setAttribute('aria-describedby', current.id);
  trigger.classList.add('curtain-trigger');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);
  const secondary = ActionButton({
    label: label + ' — настройки',
    kind: 'chrome',
    iconOnly: true,
    iconPath: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  });
  secondary.setAttribute('aria-expanded', 'false');
  secondary.setAttribute('aria-controls', id);
  secondary.hidden = !settings.length;
  const row = el('div', { class: 'curtain-trigger-row' }, [trigger, secondary]),
    back = ActionButton({
      label: 'Назад',
      kind: 'chrome',
      iconPath: 'M14 6l-6 6 6 6',
      onClick: () => close('back'),
    }),
    heading = el('h4', { id: id + '-title' }),
    body = el('div', { class: 'curtain-body' }),
    bottom = el('div', { class: 'curtain-footer' }, footer),
    panel = el(
      'section',
      { class: 'inline-curtain', id, role: 'region', 'aria-labelledby': heading.id, hidden: true },
      [el('div', { class: 'curtain-header' }, [back, heading]), body, bottom]
    ),
    backdrop = el('button', {
      type: 'button',
      class: 'curtain-backdrop',
      tabindex: '-1',
      'aria-label': 'Закрыть ' + label,
      hidden: true,
    }),
    element = el('div', { class: 'curtain-owner' }, [row, backdrop, panel]);
  const api = {
    trigger,
    kind: 'curtain',
    contains: (target) => element.contains(target),
    dismiss: (reason) => close(reason),
  };
  function paintValue() {
    current.textContent =
      options.find((option) => option.value === selected)?.label ||
      'Последнее выбранное устройство';
  }
  function render() {
    heading.textContent = mode === 'settings' ? label + ' — настройки' : label;
    bottom.hidden = mode === 'settings' || !footer.length;
    if (mode === 'settings') {
      body.replaceChildren(...settings);
      return;
    }
    if (loading) {
      body.replaceChildren(el('p', { role: 'status', text: 'Загрузка…' }));
      return;
    }
    if (error) {
      body.replaceChildren(
        el('p', { role: 'alert', text: error }),
        ActionButton({ label: 'Повторить', onClick: refresh })
      );
      return;
    }
    if (!options.length) {
      body.replaceChildren(
        el('p', {
          role: 'status',
          text: 'Нет доступных устройств. Проверьте подключение и разрешения.',
        })
      );
      return;
    }
    const list = el('div', { role: 'listbox', 'aria-label': label });
    for (const option of options) {
      const button = ActionButton({
        label: option.label,
        disabled: option.disabled,
        onClick: () => {
          selected = option.value;
          paintValue();
          onChange?.(selected);
          close('select');
        },
      });
      button.classList.add('curtain-option');
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.value === selected));
      button.tabIndex = option.value === selected ? 0 : -1;
      button.append(
        el('span', { class: 'choice-check curtain-check', 'aria-hidden': 'true' }, checkGlyph())
      );
      if (option.reason)
        button.append(el('span', { class: 'curtain-option-reason', text: option.reason }));
      list.append(button);
    }
    const available = [...list.querySelectorAll('button:not(:disabled)')];
    if (available.length && !available.some((button) => button.tabIndex === 0))
      available[0].tabIndex = 0;
    list.addEventListener('keydown', (event) => {
      const index = available.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (index + 1) % available.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + available.length) % available.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = available.length - 1;
      if (next !== undefined && available.length) {
        event.preventDefault();
        for (const button of available) button.tabIndex = -1;
        available[next].tabIndex = 0;
        available[next].focus();
      }
    });
    body.replaceChildren(
      ...(description ? [el('p', { class: 'curtain-description', text: description })] : []),
      list
    );
  }
  async function refresh() {
    const ownedFocus = panel.contains(document.activeElement);
    if (ownedFocus) back.focus({ preventScroll: true });
    const own = ++revision;
    loading = true;
    error = '';
    render();
    try {
      const result = await load();
      if (own !== revision) return;
      options = result;
      paintValue();
    } catch {
      if (own !== revision) return;
      error = 'Не удалось получить устройства. Принятый выбор сохранён.';
    } finally {
      if (own === revision) {
        loading = false;
        render();
      }
    }
  }
  function open(next) {
    if (mode === next) {
      close('back');
      return;
    }
    origin = next === 'settings' ? secondary : trigger;
    mode = next;
    claimFloating(api);
    panel.hidden = backdrop.hidden = false;
    row.inert = true;
    for (const child of element.children) {
      if (child !== panel && child !== backdrop && child !== row) {
        if (!inertBefore.has(child)) inertBefore.set(child, child.inert);
        child.inert = true;
      }
    }
    trigger.setAttribute('aria-expanded', String(next === 'options'));
    secondary.setAttribute('aria-expanded', String(next === 'settings'));
    render();
    back.focus({ preventScroll: true });
    if (next === 'options' && load) refresh();
  }
  function close(reason) {
    if (!mode) return;
    const restore = ['escape', 'back', 'select'].includes(reason);
    mode = null;
    ++revision;
    loading = false;
    row.inert = false;
    for (const [child, previous] of inertBefore) child.inert = previous;
    inertBefore.clear();
    panel.hidden = backdrop.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    secondary.setAttribute('aria-expanded', 'false');
    releaseFloating(api);
    if (restore) (origin || trigger).focus({ preventScroll: true });
  }
  trigger.addEventListener('click', () => open('options'));
  secondary.addEventListener('click', () => open('settings'));
  backdrop.addEventListener('click', () => close('back'));
  paintValue();
  return {
    element,
    trigger,
    secondary,
    panel,
    body,
    open,
    close,
    get value() {
      return selected;
    },
  };
}
