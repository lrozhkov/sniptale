import { el } from './dom.js';
import { ActionButton } from './buttons.js';
import { claimFloating, releaseFloating } from './floating-owner.js';
import { nextLayerId } from './layer-identity.js';

export function ModalDialog({
  theme,
  title,
  content,
  onAccept = () => true,
  onCancel = () => {},
  danger = false,
  compact = danger,
}) {
  const titleID = nextLayerId('modal-title-'),
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
