import { useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { createTextareaResizeStartHandler } from '../forms/helpers';

export function useAiProvidersPromptResize(promptRef: RefObject<HTMLTextAreaElement | null>) {
  return useCallback(
    (event: ReactMouseEvent) => createTextareaResizeStartHandler(promptRef, 100)(event),
    [promptRef]
  );
}
