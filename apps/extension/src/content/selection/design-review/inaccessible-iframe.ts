import {
  addEventListenerToAllWindowsDynamic,
  addWindowEventListenerToAllWindowsDynamic,
  isIframeAccessible,
} from '../../platform/frame';
import { hasActiveUserActivation, isTrustedDomEvent } from '../../platform/trusted-events';

interface IframeFocusIntent {
  iframe: HTMLIFrameElement;
  ownerWindow: Window;
}

function isHtmlIframeElement(element: EventTarget | null): element is HTMLIFrameElement {
  const candidate = element as Element | null;
  return (
    candidate?.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
    candidate.localName.toLowerCase() === 'iframe'
  );
}

/** Routes one activated pointer transfer into an inaccessible child context to its iframe. */
export function addInaccessibleIframeSelectionListener(
  onSelect: (iframe: HTMLIFrameElement) => void,
  rootWindow: Window = window
): () => void {
  let pendingTimer: number | null = null;
  let focusIntent: IframeFocusIntent | null = null;

  const clearFocusIntent = () => {
    const intent = focusIntent;
    focusIntent = null;
    if (!intent) {
      return;
    }
  };

  const resolveFocusedIframe = (intent: IframeFocusIntent) => {
    pendingTimer = null;
    let activeElement: Element | null;
    try {
      activeElement = intent.ownerWindow.document.activeElement;
    } catch {
      return;
    }
    if (activeElement !== intent.iframe || isIframeAccessible(intent.iframe)) {
      return;
    }
    onSelect(intent.iframe);
  };

  const handleIframePointerOver = (event: Event) => {
    const iframe = isHtmlIframeElement(event.target) ? event.target : null;
    const ownerWindow = iframe?.ownerDocument.defaultView;
    if (!iframe || !ownerWindow || !isTrustedDomEvent(event) || isIframeAccessible(iframe)) {
      return;
    }

    clearFocusIntent();
    focusIntent = { iframe, ownerWindow };
  };

  const handleIframePointerOut = (event: Event) => {
    const iframe = isHtmlIframeElement(event.target) ? event.target : null;
    if (iframe && focusIntent?.iframe === iframe && isTrustedDomEvent(event)) {
      clearFocusIntent();
    }
  };

  const handleWindowBlur = (event: Event, ownerWindow: Window) => {
    const intent = focusIntent;
    if (
      !intent ||
      intent.ownerWindow !== ownerWindow ||
      !isTrustedDomEvent(event) ||
      !hasActiveUserActivation(ownerWindow)
    ) {
      return;
    }

    clearFocusIntent();
    if (pendingTimer !== null) {
      rootWindow.clearTimeout(pendingTimer);
    }
    pendingTimer = rootWindow.setTimeout(() => resolveFocusedIframe(intent), 0);
  };

  const cleanupPointerIntents = addEventListenerToAllWindowsDynamic<Event>(
    'pointerover',
    handleIframePointerOver,
    { capture: true },
    { rootDocument: rootWindow.document }
  );
  const cleanupPointerExits = addEventListenerToAllWindowsDynamic<Event>(
    'pointerout',
    handleIframePointerOut,
    { capture: true },
    { rootDocument: rootWindow.document }
  );
  const cleanupBlurListeners = addWindowEventListenerToAllWindowsDynamic<Event>(
    'blur',
    handleWindowBlur,
    { capture: true },
    { rootDocument: rootWindow.document }
  );
  return () => {
    cleanupPointerIntents();
    cleanupPointerExits();
    cleanupBlurListeners();
    clearFocusIntent();
    if (pendingTimer !== null) {
      rootWindow.clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };
}
