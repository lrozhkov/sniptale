import { el } from './dom.js';
import { ActionButton } from './buttons.js';
import { nextAfter } from './layer-focus.js';
import { AnchoredLayer } from './layers.js';

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
