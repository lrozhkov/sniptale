import { useId, useLayoutEffect, type KeyboardEvent } from 'react';

/** Recorder focus follows its visible session, including the dynamically mounted range controls. */
export function useAudioRecordingFocus(
  isOpen: boolean,
  suspended = false,
  presentation: 'modal' | 'inspector' = 'modal',
  returnFocusTo?: HTMLElement | null
) {
  const titleId = useId();
  const selector =
    presentation === 'modal' ? '[role="dialog"]' : '[data-ui="audio-recording.inspector"]';
  useLayoutEffect(() => {
    if (!isOpen) return;
    const dialog = document.getElementById(titleId)?.closest<HTMLElement>(selector);
    if (!dialog) return;
    const opener = returnFocusTo ?? dialog.ownerDocument.activeElement;
    if (presentation === 'modal') dialog.setAttribute('aria-modal', 'true');
    else dialog.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    dialog.tabIndex = -1;
    return () => {
      const restore = () => {
        const active = dialog.ownerDocument.activeElement;
        if (
          presentation === 'inspector' &&
          active !== dialog.ownerDocument.body &&
          !dialog.contains(active)
        )
          return;
        if (
          opener instanceof HTMLElement &&
          opener.isConnected &&
          !opener.closest('[hidden], [inert]')
        )
          opener.focus({ preventScroll: true });
      };
      if (presentation === 'inspector') queueMicrotask(restore);
      else restore();
    };
  }, [isOpen, titleId, selector, presentation, returnFocusTo]);

  useLayoutEffect(() => {
    if (!isOpen || suspended) return;
    const dialog = document.getElementById(titleId)?.closest<HTMLElement>(selector);
    if (!dialog) return;
    const active = dialog.ownerDocument.activeElement;
    if (
      (presentation === 'modal' && !dialog.contains(active)) ||
      (dialog.contains(active) && active?.matches(':disabled'))
    ) {
      const next = dialog.querySelector<HTMLElement>('button:not(:disabled)');
      (next ?? dialog).focus({ preventScroll: true });
    }
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (presentation === 'inspector' || suspended || event.key !== 'Tab' || event.defaultPrevented)
      return;
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
