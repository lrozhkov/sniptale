import { useId, useLayoutEffect, type KeyboardEvent } from 'react';

/** Recorder focus follows its visible session, including the dynamically mounted range controls. */
export function useAudioRecordingFocus(isOpen: boolean) {
  const titleId = useId();
  useLayoutEffect(() => {
    if (!isOpen) return;
    const dialog = document.getElementById(titleId)?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const opener = dialog.ownerDocument.activeElement;
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [isOpen, titleId]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const dialog = document.getElementById(titleId)?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const active = dialog.ownerDocument.activeElement;
    if (!dialog.contains(active) || active?.matches(':disabled')) {
      const next = dialog.querySelector<HTMLElement>('button:not(:disabled)');
      (next ?? dialog).focus({ preventScroll: true });
    }
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const root = event.currentTarget;
    const controls = [
      ...root.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]'),
    ].filter(
      (node) =>
        node.tabIndex >= 0 &&
        !node.matches(':disabled') &&
        !node.closest('[hidden], [inert]') &&
        node.getAttribute('aria-disabled') !== 'true'
    );
    const first = controls[0];
    const last = controls.at(-1);
    const active = root.ownerDocument.activeElement;
    if (!first) {
      event.preventDefault();
      root.querySelector<HTMLElement>('[role="dialog"]')?.focus();
    } else if (event.shiftKey ? active === first : active === last) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };
  return { titleId, handleKeyDown };
}
