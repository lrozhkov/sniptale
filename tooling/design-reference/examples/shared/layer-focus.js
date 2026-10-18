export function nextAfter(trigger, backward = false) {
  const scope = trigger.closest('dialog') || document,
    items = [...scope.querySelectorAll('a[href],button,input,textarea,select,[tabindex]')].filter(
      (e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length && !e.closest('[hidden]')
    ),
    index = items.indexOf(trigger);
  return items[index + (backward ? -1 : 1)];
}
