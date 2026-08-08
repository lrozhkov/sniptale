import { useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

function createPromptResizeStartHandler(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  minimumHeight: number
) {
  return (event: ReactMouseEvent) => {
    event.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;
    const startY = event.clientY;
    const startHeight = textarea.clientHeight;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      textarea.style.height = `${Math.max(minimumHeight, startHeight + moveEvent.clientY - startY)}px`;
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
}

export function useAiProvidersPromptResize(promptRef: RefObject<HTMLTextAreaElement | null>) {
  return useCallback(
    (event: ReactMouseEvent) => createPromptResizeStartHandler(promptRef, 100)(event),
    [promptRef]
  );
}
