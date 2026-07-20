import { isIframeAccessible } from '../../../../platform/frame';

export function registerIframeScrollListeners(debouncedHandleScroll: () => void) {
  const iframeCleanups: Array<() => void> = [];
  const trackedIframeLoadListeners = new WeakSet<HTMLIFrameElement>();
  const registerScrollTarget = createScrollTargetRegistrar(iframeCleanups, debouncedHandleScroll);
  const addIframeListeners = createIframeScrollListenerRegistrar({
    debouncedHandleScroll,
    iframeCleanups,
    registerScrollTarget,
    trackedIframeLoadListeners,
  });

  document.querySelectorAll('iframe').forEach((iframe) => {
    const iframeEl = iframe as HTMLIFrameElement;
    if (isIframeAccessible(iframeEl)) {
      addIframeListeners(iframeEl);
    }
  });

  return { iframeCleanups, addIframeListeners };
}

function createScrollTargetRegistrar(
  iframeCleanups: Array<() => void>,
  debouncedHandleScroll: () => void
) {
  return (target: EventTarget | null) => {
    if (!target) {
      return;
    }

    const useCapture = isDocumentScrollTarget(target);
    target.addEventListener('scroll', debouncedHandleScroll, {
      ...(useCapture ? { capture: true } : {}),
      passive: true,
    });
    iframeCleanups.push(() => {
      try {
        target.removeEventListener(
          'scroll',
          debouncedHandleScroll,
          useCapture ? { capture: true } : undefined
        );
      } catch {
        // Cross-origin iframe - ignore
      }
    });
  };
}

function isDocumentScrollTarget(target: EventTarget): boolean {
  return (target as Document).nodeType === Node.DOCUMENT_NODE;
}

function createIframeScrollListenerRegistrar(args: {
  debouncedHandleScroll: () => void;
  iframeCleanups: Array<() => void>;
  registerScrollTarget: (target: EventTarget | null) => void;
  trackedIframeLoadListeners: WeakSet<HTMLIFrameElement>;
}) {
  return (iframeEl: HTMLIFrameElement) => {
    try {
      const iframeWin = iframeEl.contentWindow;
      const iframeDoc = iframeEl.contentDocument;
      if (!iframeWin) {
        return;
      }

      iframeWin.addEventListener('scroll', args.debouncedHandleScroll, { passive: true });
      iframeWin.addEventListener('resize', args.debouncedHandleScroll);
      args.registerScrollTarget(iframeDoc);
      args.registerScrollTarget(iframeDoc?.scrollingElement ?? null);

      args.iframeCleanups.push(() => {
        try {
          iframeWin.removeEventListener('scroll', args.debouncedHandleScroll);
          iframeWin.removeEventListener('resize', args.debouncedHandleScroll);
        } catch {
          // Cross-origin iframe - ignore
        }
      });

      registerIframeLoadListener(iframeEl, args);
    } catch {
      // Cross-origin iframe - ignore
    }
  };
}

function registerIframeLoadListener(
  iframeEl: HTMLIFrameElement,
  args: {
    debouncedHandleScroll: () => void;
    iframeCleanups: Array<() => void>;
    registerScrollTarget: (target: EventTarget | null) => void;
    trackedIframeLoadListeners: WeakSet<HTMLIFrameElement>;
  }
) {
  if (args.trackedIframeLoadListeners.has(iframeEl)) {
    return;
  }

  const addIframeListeners = createIframeScrollListenerRegistrar(args);
  const handleIframeLoad = () => {
    addIframeListeners(iframeEl);
    args.debouncedHandleScroll();
  };

  iframeEl.addEventListener('load', handleIframeLoad);
  args.trackedIframeLoadListeners.add(iframeEl);
  args.iframeCleanups.push(() => {
    iframeEl.removeEventListener('load', handleIframeLoad);
  });
}
