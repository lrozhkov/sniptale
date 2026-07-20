export function scheduleDomDriverTimeout(
  callback: () => void,
  ms: number,
  targetDocument?: Document
): ReturnType<typeof globalThis.setTimeout> {
  return (targetDocument?.defaultView ?? globalThis).setTimeout(callback, ms);
}

export function clearDomDriverTimeout(
  timeoutId: ReturnType<typeof globalThis.setTimeout>,
  targetDocument?: Document
): void {
  (targetDocument?.defaultView ?? globalThis).clearTimeout(timeoutId);
}

export function resolveKeyboardEventConstructor(
  targetDocument: Document
): typeof KeyboardEvent | null {
  if (targetDocument.defaultView?.KeyboardEvent) {
    return targetDocument.defaultView.KeyboardEvent;
  }

  return typeof KeyboardEvent === 'undefined' ? null : KeyboardEvent;
}

export function resolveMutationObserverConstructor(
  targetDocument: Document
): typeof MutationObserver | null {
  if (targetDocument.defaultView?.MutationObserver) {
    return targetDocument.defaultView.MutationObserver;
  }

  return typeof MutationObserver === 'undefined' ? null : MutationObserver;
}
