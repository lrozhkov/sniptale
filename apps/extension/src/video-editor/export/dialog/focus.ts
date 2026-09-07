import { useLayoutEffect, type RefObject } from 'react';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';

/** Export owns Tab order across its form and portaled selects; select navigation stays local. */
export function useExportDialogFocus(rootRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const dialog = rootRef.current?.querySelector<HTMLElement>(
      '[role="dialog"], [role="alertdialog"]'
    );
    if (!dialog) return;
    const document = dialog.ownerDocument;
    const opener = document.activeElement;
    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
      ].filter((node) => node.getAttribute('type') !== 'hidden' && !node.hidden);
    dialog.setAttribute('aria-modal', 'true');
    controls()[0]?.focus({ preventScroll: true });

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const layers = getOwnedFloatingInteractionLayers(dialog, document);
      const available = controls();
      const layer = layers.find((candidate) => candidate.contains(document.activeElement));
      if (layer) {
        const ownerIndex = available.findIndex(
          (control) => control.getAttribute('aria-controls') === layer.id
        );
        const step = event.shiftKey ? -1 : 1;
        const nextIndex =
          ownerIndex < 0 ? 0 : (ownerIndex + step + available.length) % available.length;
        event.preventDefault();
        available[nextIndex]?.focus({ preventScroll: true });
        return;
      }
      const first = available[0];
      const last = available.at(-1);
      const active = document.activeElement;
      if (!dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [rootRef]);
}
