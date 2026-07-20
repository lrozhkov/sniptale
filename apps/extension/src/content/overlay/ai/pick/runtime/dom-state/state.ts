import { createAiPickElementIndex } from '../dom-index';

export type AiPickDomState = {
  cleanupCursorStyles: (() => void) | null;
  cleanupEventListeners: (() => void) | null;
  cursorStyleElement: HTMLStyleElement | null;
  elementIndex: ReturnType<typeof createAiPickElementIndex>;
  navigationLockEnabledBeforeSetup: boolean | null;
};

export function createAiPickDomState(): AiPickDomState {
  return {
    cleanupCursorStyles: null,
    cleanupEventListeners: null,
    cursorStyleElement: null,
    elementIndex: createAiPickElementIndex(),
    navigationLockEnabledBeforeSetup: null,
  };
}
