import { attachIframeDocumentTree } from './document-tree';

function createDebouncedScrollHandler(handler: () => void, debounceMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    debouncedHandler: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(handler, debounceMs);
    },
    clear: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}

function attachWindowListeners(
  win: Window | null,
  trackedWindows: WeakSet<Window>,
  debouncedHandler: () => void,
  cleanupFns: Array<() => void>
): void {
  if (!win || trackedWindows.has(win)) {
    return;
  }

  trackedWindows.add(win);
  win.addEventListener('scroll', debouncedHandler, { passive: true });
  win.addEventListener('resize', debouncedHandler, { passive: true });
  cleanupFns.push(() => {
    try {
      win.removeEventListener('scroll', debouncedHandler);
      win.removeEventListener('resize', debouncedHandler);
    } catch {
      // Cross-origin iframe navigation can invalidate the window before cleanup.
    }
  });
}

/**
 * Add scroll and resize listeners to all windows (top-level + same-origin iframes).
 */
export function addScrollListenersToAllWindows(handler: () => void, debounceMs = 100): () => void {
  const cleanupFns: Array<() => void> = [];
  const observedDocs = new WeakSet<Document>();
  const trackedWindows = new WeakSet<Window>();
  const { debouncedHandler, clear } = createDebouncedScrollHandler(handler, debounceMs);

  const attachDocumentTree = (doc: Document): void => {
    attachWindowListeners(doc.defaultView, trackedWindows, debouncedHandler, cleanupFns);
    attachIframeDocumentTree(doc, {
      cleanupFns,
      observedDocs,
      onIframeDocument: (iframeDoc) => attachDocumentTree(iframeDoc),
    });
  };

  attachDocumentTree(document);

  return () => {
    clear();
    cleanupFns.forEach((cleanup) => cleanup());
  };
}
