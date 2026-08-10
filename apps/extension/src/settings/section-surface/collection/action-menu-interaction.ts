import { useCallback, useEffect, useRef } from 'react';

const POINTER_LEAVE_CLOSE_DELAY = 900;

export function useSettingsCollectionActionMenuInteraction(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { onOpenChange, open } = props;

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);
  const closeAndRestoreFocus = useCallback(() => {
    cancelScheduledClose();
    onOpenChange(false);
    triggerRef.current?.focus();
  }, [cancelScheduledClose, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[data-collection-inline-action]')?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      closeAndRestoreFocus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAndRestoreFocus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeAndRestoreFocus, open]);

  useEffect(() => () => cancelScheduledClose(), [cancelScheduledClose]);

  return {
    closeAndRestoreFocus,
    rootRef,
    triggerRef,
    onBlur(event: React.FocusEvent<HTMLDivElement>) {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
        return;
      onOpenChange(false);
    },
    onPointerEnter: cancelScheduledClose,
    onPointerLeave() {
      if (!open) return;
      cancelScheduledClose();
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        if (rootRef.current?.contains(document.activeElement)) return;
        onOpenChange(false);
      }, POINTER_LEAVE_CLOSE_DELAY);
    },
  };
}
