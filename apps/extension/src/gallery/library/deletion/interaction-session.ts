function focusMenuButton(surface: HTMLElement, direction: string) {
  const buttons = [...surface.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  const index = buttons.indexOf(surface.ownerDocument.activeElement as HTMLButtonElement);
  const next =
    direction === 'Home'
      ? 0
      : direction === 'End'
        ? buttons.length - 1
        : (index + (direction === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

function handleMenuKey(event: KeyboardEvent, surface: HTMLElement, dismiss: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    dismiss();
    return;
  }
  if (!surface.contains(document.activeElement)) return;
  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    focusMenuButton(surface, event.key);
    return;
  }
  if (event.key === 'Tab') dismiss();
  if (event.repeat && ['Enter', ' ', 'Delete'].includes(event.key)) event.preventDefault();
}

/** One DOM interaction session owns keyboard containment, dismissal and focus recovery. */
export function bindDeletionMenuInteractions(
  surface: HTMLElement,
  anchor: HTMLElement | null,
  keyboard: boolean,
  dismiss: () => void
) {
  let focusInside = false;
  const onFocusIn = () => {
    focusInside = true;
  };
  const onFocusOut = (event: FocusEvent) => {
    focusInside = event.relatedTarget instanceof Node && surface.contains(event.relatedTarget);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!event.composedPath().includes(surface) && event.target !== anchor) dismiss();
  };
  const onKeyDown = (event: KeyboardEvent) => handleMenuKey(event, surface, dismiss);
  surface.addEventListener('focusin', onFocusIn);
  surface.addEventListener('focusout', onFocusOut);
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  if (keyboard) surface.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  return () => {
    if (focusInside && document.activeElement === document.body && anchor?.isConnected)
      anchor.focus();
    surface.removeEventListener('focusin', onFocusIn);
    surface.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
  };
}
