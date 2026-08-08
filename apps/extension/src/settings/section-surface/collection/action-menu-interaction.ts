import { useEffect, useRef } from 'react';

type FocusDirection = 1 | -1 | 'first' | 'last';

export function useSettingsCollectionActionMenuInteraction(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { onOpenChange, open } = props;

  useEffect(() => {
    if (!open) return;
    const menu = rootRef.current?.querySelector<HTMLElement>('[role="menu"]');
    menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onOpenChange, open]);

  const closeAndRestoreFocus = () => {
    onOpenChange(false);
    triggerRef.current?.focus();
  };
  const focusMenuItem = (direction: FocusDirection) => {
    const buttons = [
      ...(rootRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      ) ?? []),
    ];
    if (buttons.length === 0) return;
    if (direction === 'first' || direction === 'last') {
      buttons[direction === 'first' ? 0 : buttons.length - 1]?.focus();
      return;
    }
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return { closeAndRestoreFocus, focusMenuItem, rootRef, triggerRef };
}
