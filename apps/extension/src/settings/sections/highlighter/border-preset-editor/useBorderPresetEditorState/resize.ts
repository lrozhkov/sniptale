import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';

import type { BorderPresetDraftState } from './types';
import { beginBorderPresetResize } from './resize-listeners';

export function useBorderPresetResize({
  isOpen,
  setIsResizing,
  setTextareaHeight,
  textareaHeight,
}: Pick<
  BorderPresetDraftState,
  'isResizing' | 'setIsResizing' | 'setTextareaHeight' | 'textareaHeight'
> & {
  isOpen: boolean;
}) {
  const cleanupResizeListenersRef = useRef<(() => void) | null>(null);
  const clearResizeListeners = useCallback(() => {
    cleanupResizeListenersRef.current?.();
    cleanupResizeListenersRef.current = null;
  }, []);

  useEffect(() => clearResizeListeners, [clearResizeListeners]);

  useEffect(() => {
    if (!isOpen) {
      clearResizeListeners();
      setIsResizing(false);
    }
  }, [clearResizeListeners, isOpen, setIsResizing]);

  return useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      clearResizeListeners();
      cleanupResizeListenersRef.current = beginBorderPresetResize({
        clearResizeListeners,
        setIsResizing,
        setTextareaHeight,
        startY: event.clientY,
        textareaHeight,
      });
    },
    [clearResizeListeners, setIsResizing, setTextareaHeight, textareaHeight]
  );
}
