import { useEffect } from 'react';
import { normalizeHotkeyKey } from '../../features/keyboard-shortcuts/hotkeys';
import { isEditableElementTarget } from '../keyboard/editable-target';

interface CommandPaletteHotkeyOptions {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  enabled?: boolean;
}

export function useCommandPaletteHotkey({
  isOpen,
  onOpen,
  onClose,
  enabled = true,
}: CommandPaletteHotkeyOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        normalizeHotkeyKey(event.key, event.code).toLowerCase() === 'k'
      ) {
        if (isEditableElementTarget(event.target)) {
          return;
        }

        event.preventDefault();

        if (isOpen) {
          onClose();
          return;
        }

        onOpen();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, isOpen, onClose, onOpen]);
}
