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

function readPageIdentity(windowObject: Window): string {
  const url = new URL(windowObject.location.href);
  url.hash = '';
  return url.href;
}

/** Watches page identity changes that do not recreate the content-script document. */
export function subscribeToBrowserAnnotationDocumentNavigation(args: {
  onNavigation: AnnotationDocumentNavigationListener;
  windowObject?: Window;
}): () => void {
  const windowObject = args.windowObject ?? window;
  const navigationSource = readNavigationEventSource(windowObject);
  let currentPageIdentity = readPageIdentity(windowObject);

  const checkPageIdentity = () => {
    const nextPageIdentity = readPageIdentity(windowObject);
    if (nextPageIdentity === currentPageIdentity) {
      return;
    }
    currentPageIdentity = nextPageIdentity;
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
