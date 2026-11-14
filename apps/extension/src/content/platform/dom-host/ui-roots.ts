import { CONTENT_APP_CONTAINER_ID, CONTENT_OVERLAY_ROOT_ID } from '@sniptale/ui/branding';

type ContentUiSurface = 'app' | 'overlay';

type ContentShadowRootRegistration = {
  lifecycle: 'pending' | 'active';
  observer: MutationObserver | null;
  shadowRoot: ShadowRoot;
  placement: {
    synchronize: (records: MutationRecord[], rescan?: boolean) => void;
    dispose: () => void;
  } | null;
};

let hasInitializedContentShadowRoot = false;
let initializedContentRegistration: ContentShadowRootRegistration | null = null;
const retiredContentShadowRoots = new WeakSet<ShadowRoot>();

function mutationRemovedHost(records: MutationRecord[], host: Element): boolean {
  return records.some((record) =>
    Array.from(record.removedNodes).some((removedNode) =>
      removedNode === host ? true : removedNode.contains(host)
    )
  );
}

function retireContentShadowRoot(registration: ContentShadowRootRegistration): void {
  if (initializedContentRegistration !== registration) {
    return;
  }

  registration.placement?.dispose();
  registration.observer?.disconnect();
  registration.observer = null;
  retiredContentShadowRoots.add(registration.shadowRoot);
  initializedContentRegistration = null;
}

function activateContentShadowRoot(registration: ContentShadowRootRegistration): void {
  if (
    initializedContentRegistration !== registration ||
    !registration.shadowRoot.host.isConnected
  ) {
    return;
  }

  registration.lifecycle = 'active';
  if (typeof MutationObserver === 'undefined') {
    return;
  }

  const host = registration.shadowRoot.host;
  const observer = new MutationObserver((records) => {
    if (registration.placement) {
      registration.placement.synchronize(records);
      return;
    }
    if (
      initializedContentRegistration === registration &&
      (mutationRemovedHost(records, host) || !host.isConnected)
    ) {
      retireContentShadowRoot(registration);
    }
  });
  registration.observer = observer;
  observeContentHost(registration);
}

function refreshContentShadowRootRegistration(
  registration: ContentShadowRootRegistration
): ShadowRoot | null {
  if (registration.lifecycle === 'pending') {
    if (!registration.shadowRoot.host.isConnected) {
      return null;
    }

    activateContentShadowRoot(registration);
    return registration.shadowRoot;
  }

  const observerRecords = registration.observer?.takeRecords() ?? [];
  if (registration.placement) {
    registration.placement.synchronize(observerRecords);
    return initializedContentRegistration === registration ? registration.shadowRoot : null;
  }
  if (
    mutationRemovedHost(observerRecords, registration.shadowRoot.host) ||
    !registration.shadowRoot.host.isConnected
  ) {
    retireContentShadowRoot(registration);
    return null;
  }

  return registration.shadowRoot;
}

/**
 * Resolves the exact live shadow root registered by the content UI initializer.
 *
 * Kept out of the public DOM-host barrel: this is the private identity seam used by sibling
 * DOM-host helpers, not a selector-based discovery API.
 */
export function resolveInitializedContentShadowRoot(): ShadowRoot | null {
  const registration = initializedContentRegistration;
  if (!registration) {
    return null;
  }

  return refreshContentShadowRootRegistration(registration);
}

/**
 * Allows light-DOM compatibility only before any content-root identity has been registered.
 */
export function isContentUiBootstrapFallbackAllowed(): boolean {
  return !hasInitializedContentShadowRoot;
}

function registerInitializedContentShadowRoot(shadowRoot: ShadowRoot): void {
  if (retiredContentShadowRoots.has(shadowRoot)) {
    return;
  }

  const currentRegistration = initializedContentRegistration;
  if (currentRegistration?.shadowRoot === shadowRoot) {
    refreshContentShadowRootRegistration(currentRegistration);
    return;
  }

  if (currentRegistration) {
    retireContentShadowRoot(currentRegistration);
  }

  const registration: ContentShadowRootRegistration = {
    lifecycle: shadowRoot.host.isConnected ? 'active' : 'pending',
    observer: null,
    shadowRoot,
    placement: null,
  };
  initializedContentRegistration = registration;
  hasInitializedContentShadowRoot = true;

  if (registration.lifecycle === 'active') {
    activateContentShadowRoot(registration);
    return;
  }

  // why: bootstrap initializes the roots immediately before a synchronous host append.
  queueMicrotask(() => {
    if (initializedContentRegistration !== registration) {
      return;
    }

    if (registration.lifecycle !== 'pending') {
      return;
    }

    if (shadowRoot.host.isConnected) {
      activateContentShadowRoot(registration);
      return;
    }

    retireContentShadowRoot(registration);
  });
}

function observeContentHost(registration: ContentShadowRootRegistration): void {
  registration.observer?.observe(registration.shadowRoot.ownerDocument, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });
}

function contentHostParent(document: Document): HTMLElement {
  const modals = Array.from(document.querySelectorAll('dialog')).filter((dialog) =>
    dialog.matches(':modal')
  );
  const focused = document.activeElement?.closest('dialog');
  return modals.find((dialog) => dialog === focused) ?? modals.at(-1) ?? document.body;
}

function promoteContentHost(host: HTMLElement): void {
  if (!host.hasAttribute('popover')) return;
  try {
    host.showPopover();
  } catch {
    host.removeAttribute('popover');
  }
}

/** Mounts the exact registered host inside page modality without replacing its shadow tree. */
export function mountContentUiHost(host: HTMLElement): () => void {
  const document = host.ownerDocument;
  if (typeof host.showPopover === 'function') host.setAttribute('popover', 'manual');
  document.body.appendChild(host);
  const shadow = resolveInitializedContentShadowRoot();
  const registration = initializedContentRegistration;
  if (!registration || shadow?.host !== host) return () => undefined;
  let parent: HTMLElement = document.body;
  const synchronize = (records: MutationRecord[], rescan = false) => {
    if (initializedContentRegistration !== registration) return;
    // Only removal of the containing modal permits recovery. Direct host moves still retire it.
    const removedHost = records.some((record) => Array.from(record.removedNodes).includes(host));
    const removedModal =
      parent instanceof HTMLDialogElement && !parent.isConnected && host.parentElement === parent;
    if (
      removedHost ||
      host.parentElement !== parent ||
      (mutationRemovedHost(records, host) && !removedModal) ||
      (!host.isConnected && !removedModal)
    ) {
      retireContentShadowRoot(registration);
      return;
    }
    const modalChanged = records.some(
      (record) => record.type === 'attributes' && record.target instanceof HTMLDialogElement
    );
    if (!rescan && host.isConnected && !modalChanged) return;
    const target = contentHostParent(document);
    if (target === parent && host.isConnected) return;
    // Drain external mutations before this move, then exclude only the owner's synchronous move.
    registration.observer?.disconnect();
    try {
      target.appendChild(host);
      parent = target;
    } finally {
      observeContentHost(registration);
    }
    promoteContentHost(host);
  };
  const onModalityChange = () => synchronize(registration.observer?.takeRecords() ?? [], true);
  const dispose = () => {
    document.removeEventListener('focusin', onModalityChange, true);
    document.removeEventListener('close', onModalityChange, true);
    registration.placement = null;
  };
  registration.placement = { synchronize, dispose };
  document.addEventListener('focusin', onModalityChange, true);
  document.addEventListener('close', onModalityChange, true);
  onModalityChange();
  promoteContentHost(host);
  return dispose;
}

function getContentSurfaceId(surface: ContentUiSurface): string {
  return surface === 'app' ? CONTENT_APP_CONTAINER_ID : CONTENT_OVERLAY_ROOT_ID;
}

function createContentSurfaceRoot(
  shadowRoot: ShadowRoot,
  surface: ContentUiSurface
): HTMLDivElement {
  const container = shadowRoot.ownerDocument.createElement('div');
  container.id = getContentSurfaceId(surface);

  if (surface === 'overlay') {
    // why: the wrapper itself must not become a top-level stacking layer above `.sniptale-app`,
    // otherwise page-blocking overlays also block the prep toolbar. Child surfaces own z-order.
    container.style.display = 'contents';
  }

  return container;
}

/**
 * Creates the canonical app + overlay roots inside a prepared content shadow tree.
 */
export function initializeContentUiRoots(shadowRoot: ShadowRoot): {
  appContainer: HTMLDivElement;
  overlayRoot: HTMLDivElement;
} {
  registerInitializedContentShadowRoot(shadowRoot);
  const appContainer =
    (shadowRoot.getElementById(CONTENT_APP_CONTAINER_ID) as HTMLDivElement | null) ??
    createContentSurfaceRoot(shadowRoot, 'app');
  const overlayRoot =
    (shadowRoot.getElementById(CONTENT_OVERLAY_ROOT_ID) as HTMLDivElement | null) ??
    createContentSurfaceRoot(shadowRoot, 'overlay');

  appContainer.classList.add('sniptale-extension-surface');
  overlayRoot.classList.add('sniptale-extension-surface');

  if (!appContainer.isConnected) {
    shadowRoot.appendChild(appContainer);
  }

  if (!overlayRoot.isConnected) {
    shadowRoot.appendChild(overlayRoot);
  }

  return { appContainer, overlayRoot };
}
