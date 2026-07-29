import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

type AnnotationDocumentNavigationListener = () => void;

interface AnnotationNavigationEventSource {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

function isAnnotationNavigationEventSource(
  value: unknown
): value is AnnotationNavigationEventSource {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['addEventListener'] === 'function' &&
    typeof value['removeEventListener'] === 'function'
  );
}

function readNavigationEventSource(windowObject: Window): AnnotationNavigationEventSource | null {
  const source: unknown = Reflect.get(windowObject, 'navigation');
  return isAnnotationNavigationEventSource(source) ? source : null;
}

/** Watches URL identity changes that do not recreate the content-script document. */
export function subscribeToBrowserAnnotationDocumentNavigation(args: {
  onNavigation: AnnotationDocumentNavigationListener;
  windowObject?: Window;
}): () => void {
  const windowObject = args.windowObject ?? window;
  const navigationSource = readNavigationEventSource(windowObject);
  let currentUrl = windowObject.location.href;

  const checkPageIdentity = () => {
    const nextUrl = windowObject.location.href;
    if (nextUrl === currentUrl) {
      return;
    }
    currentUrl = nextUrl;
    args.onNavigation();
  };
  const eventListener: EventListener = () => checkPageIdentity();

  windowObject.addEventListener('hashchange', eventListener);
  windowObject.addEventListener('popstate', eventListener);
  navigationSource?.addEventListener('navigatesuccess', eventListener);

  return () => {
    windowObject.removeEventListener('hashchange', eventListener);
    windowObject.removeEventListener('popstate', eventListener);
    navigationSource?.removeEventListener('navigatesuccess', eventListener);
  };
}
