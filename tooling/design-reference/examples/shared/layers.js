import { el } from './dom.js';
import { claimFloating, releaseFloating, anchorVisible } from './floating-owner.js';
import { nextAfter } from './layer-focus.js';
import { nextLayerId } from './layer-identity.js';

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
      id: nextLayerId('anchored-'),
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
