import { el } from './dom.js';
import { ActionButton, icon } from './buttons.js';
import { checkGlyph } from './selection.js';
import { claimFloating, releaseFloating, anchorVisible } from './floating-owner.js';
let serial = 0;
function nextAfter(trigger, backward = false) {
  const scope = trigger.closest('dialog') || document,
    items = [...scope.querySelectorAll('a[href],button,input,textarea,select,[tabindex]')].filter(
      (e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length && !e.closest('[hidden]')
    ),
    index = items.indexOf(trigger);
  return items[index + (backward ? -1 : 1)];
}

export function AnchoredLayer({
  trigger,
  content,
  width = 300,
  label,
  role = 'dialog',
  placement = 'down',
  onDismiss = () => {},
}) {
  const pane = el(
    'div',
    {
      class: 'anchored-layer popup',
      id: 'anchored-' + ++serial,
      role,
      'aria-label': label,
      tabindex: '-1',
      popover: 'manual',
    },
    content
  );
  pane.hidden = true;
  (trigger.closest('dialog') || trigger.closest('.theme')).append(pane);
  trigger.setAttribute('aria-controls', pane.id);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', role === 'menu' ? 'menu' : 'dialog');
  let visible = false,
    observer,
    events;
  const api = {
    trigger,
    pane,
    contains: (node) => trigger.contains(node) || pane.contains(node),
    dismiss: close,
    get visible() {
      return visible;
    },
    suspended: false,
    open,
    close,
    position,
  };
  function position() {
    if (!visible) return;
    if (!anchorVisible(trigger)) {
      close('anchor');
      return;
    }
    pane.style.width = Math.min(width, innerWidth - 20) + 'px';
    pane.style.maxHeight = Math.max(80, innerHeight - 20) + 'px';
    const r = trigger.getBoundingClientRect(),
      h = pane.offsetHeight,
      w = pane.offsetWidth,
      below = innerHeight - r.bottom - 10,
      above = r.top - 10,
      up = below < h + 6 && above > below;
    pane.dataset.direction = up ? 'up' : 'down';
    pane.style.left = Math.max(10, Math.min(r.left, innerWidth - w - 10)) + 'px';
    pane.style.top =
      Math.max(10, Math.min(up ? r.top - h - 6 : r.bottom + 6, innerHeight - h - 10)) + 'px';
    if (placement === 'side') {
      const right = innerWidth - r.right - 10,
        side = right >= w + 4 || right >= r.left - 10 ? 'right' : 'left';
      pane.dataset.direction = side;
      pane.style.left =
        Math.max(
          10,
          Math.min(side === 'right' ? r.right + 4 : r.left - w - 4, innerWidth - w - 10)
        ) + 'px';
      pane.style.top = Math.max(10, Math.min(r.top, innerHeight - h - 10)) + 'px';
    }
  }
  function open() {
    if (visible || trigger.disabled) return;
    visible = true;
    claimFloating(api);
    pane.hidden = false;
    pane.showPopover?.();
    trigger.setAttribute('aria-expanded', 'true');
    events = new AbortController();
    window.addEventListener('resize', position, { signal: events.signal });
    window.addEventListener('scroll', position, { capture: true, signal: events.signal });
    observer = new ResizeObserver(position);
    observer.observe(trigger);
    observer.observe(pane);
    position();
    if (visible) {
      const first = pane.querySelector('input:not(:disabled),button:not(:disabled),[tabindex="0"]');
      (first || pane).focus({ preventScroll: true });
    }
  }
  function close(reason = 'cancel') {
    if (!visible) return;
    const focus =
      pane.contains(document.activeElement) ||
      document.activeElement === document.body ||
      document.activeElement === trigger;
    visible = false;
    pane.hidePopover?.();
    pane.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    observer?.disconnect();
    events?.abort();
    releaseFloating(api);
    onDismiss(reason);
    if (reason === 'anchor' && focus) {
      for (let parent = trigger.parentElement; parent; parent = parent.parentElement) {
        if (parent.tabIndex >= 0 && /auto|scroll/.test(getComputedStyle(parent).overflowY)) {
          parent.focus({ preventScroll: true });
          break;
        }
      }
    }
    if (['escape', 'cancel', 'accept'].includes(reason) && focus && trigger.isConnected)
      trigger.focus({ preventScroll: true });
  }
  pane.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...pane.querySelectorAll('input,textarea,button,[tabindex]')].filter(
      (e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length
    );
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      close('outside');
      trigger.focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault();
      const next = nextAfter(trigger);
      close('outside');
      (next || trigger).focus();
    }
  });
  trigger.addEventListener('click', () => (visible ? close('cancel') : open()));
  return api;
}
export function CommandMenu({
  label,
  items,
  iconPath = 'M12 5 V19 M5 12 H19',
  iconOnly = false,
  indicator = null,
  placement = 'down',
  tabOrigin = null,
  onExit = () => {},
  onAccept = () => {},
}) {
  const trigger = ActionButton({ label, iconPath, iconOnly, density: 'compact' });
  let layer;
  if (indicator) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('menu-indicator');
    svg.dataset.axis = indicator;
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', indicator === 'side' ? 'M6 4 L10 8 L6 12' : 'M4 6 L8 10 L12 6');
    svg.append(path);
    trigger.append(svg);
  }
  const list = el('div', { class: 'command-list' }),
    buttons = [],
    children = [];
  for (const item of items) {
    let child;
    const button = item.children
      ? (child = CommandMenu({
          label: item.label,
          items: item.children,
          iconPath: null,
          indicator: 'side',
          placement: 'side',
          tabOrigin: tabOrigin || trigger,
          onExit: () => {
            layer.close('outside');
            onExit();
          },
          onAccept: () => {
            layer.close('accept');
            onAccept();
          },
        })).trigger
      : ActionButton({
          label: item.label,
          kind: item.danger ? 'danger' : 'secondary',
          disabled: !!item.disabled,
          onClick: () => {
            item.action?.();
            layer.close('accept');
            onAccept();
          },
        });
    if (child) children.push({ child, button });
    button.disabled = !!item.disabled;
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    buttons.push(button);
    list.append(button);
    button.addEventListener('keydown', (event) => {
      const enabled = buttons.filter((b) => !b.disabled),
        i = enabled.indexOf(button);
      let next;
      if (event.key === 'ArrowDown') next = enabled[(i + 1) % enabled.length];
      else if (event.key === 'ArrowUp') next = enabled[(i - 1 + enabled.length) % enabled.length];
      else if (event.key === 'Home') next = enabled[0];
      else if (event.key === 'End') next = enabled.at(-1);
      else if (event.key === 'ArrowRight' && child) {
        event.preventDefault();
        child.layer.open();
        return;
      } else if (event.key === 'ArrowLeft' && placement === 'side') {
        event.preventDefault();
        layer.close('cancel');
        return;
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const next = nextAfter(tabOrigin || trigger, event.shiftKey);
        layer.close('outside');
        onExit();
        (next || tabOrigin || trigger).focus();
        return;
      }
      if (next) {
        event.preventDefault();
        next.focus();
      }
    });
  }
  const api = {
    trigger,
    get layer() {
      return layer;
    },
    mount() {
      layer = AnchoredLayer({ trigger, content: list, width: 280, label, role: 'menu', placement });
      for (const { child } of children) child.mount();
      trigger.addEventListener('keydown', (event) => {
        if (placement !== 'side' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          layer.open();
          const enabled = buttons.filter((b) => !b.disabled);
          (event.key === 'ArrowUp' ? enabled.at(-1) : enabled[0])?.focus();
        }
      });
      return layer;
    },
  };
  return api;
}
export function ModalDialog({
  theme,
  title,
  content,
  onAccept = () => true,
  onCancel = () => {},
  danger = false,
  compact = danger,
}) {
  const titleID = 'modal-title-' + ++serial,
    heading = el('h3', { id: titleID, text: title }),
    body = el('div', { class: 'dialog-body' }, content),
    cancel = ActionButton({ label: 'Отмена' }),
    accept = ActionButton({
      label: danger ? 'Подтвердить' : 'Применить',
      kind: danger ? 'danger' : 'primary',
    }),
    pane = el(
      'dialog',
      {
        class: 'reference-dialog',
        'data-layout': compact ? 'confirmation' : 'editor',
        'aria-labelledby': titleID,
        tabindex: '-1',
      },
      [
        el('header', { class: 'dialog-header' }, heading),
        body,
        el('footer', { class: 'dialog-footer' }, [cancel, accept]),
      ]
    );
  theme.append(pane);
  let origin;
  const api = {
    pane,
    body,
    cancel,
    accept,
    get trigger() {
      return origin;
    },
    dismissOutside: false,
    contains: (node) => pane.contains(node),
    dismiss: (reason) => close(reason),
    open,
    close,
  };
  function open(trigger) {
    origin = trigger;
    claimFloating(api);
    pane.showModal();
    if (danger) cancel.focus();
    else (pane.querySelector('input:not(:disabled),textarea:not(:disabled)') || cancel).focus();
  }
  function close(reason = 'cancel') {
    if (!pane.open) return;
    const restore =
      pane.contains(document.activeElement) || document.activeElement === document.body;
    pane.close(reason);
    releaseFloating(api);
    if (reason !== 'accept') onCancel();
    if (restore && origin?.isConnected) origin.focus({ preventScroll: true });
  }
  pane.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const available = [
      ...pane.querySelectorAll('button,input,textarea,select,a[href],[tabindex]'),
    ].filter((e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length);
    if (!available.length) {
      event.preventDefault();
      pane.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === available[0]) {
      event.preventDefault();
      available.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === available.at(-1)) {
      event.preventDefault();
      available[0].focus();
    }
  });
  pane.addEventListener('cancel', (event) => {
    event.preventDefault();
    close('escape');
  });
  cancel.addEventListener('click', () => close('cancel'));
  accept.addEventListener('click', () => {
    if (onAccept() !== false) close('accept');
  });
  return api;
}
export function NativeHint({ trigger, text, shouldShow = () => true }) {
  let content = text;
  function refresh() {
    if (shouldShow()) trigger.title = content;
    else trigger.removeAttribute('title');
  }
  function hide() {
    trigger.removeAttribute('title');
  }
  trigger.addEventListener('pointerenter', refresh);
  trigger.addEventListener('focus', refresh);
  refresh();
  return {
    show: refresh,
    hide,
    setText(value) {
      content = value;
      refresh();
    },
  };
}

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
  const id = 'reference-curtain-' + ++serial;
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
