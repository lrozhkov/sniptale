import { CONTENT_APP_CONTAINER_ID, CONTENT_OVERLAY_ROOT_ID } from '@sniptale/ui/branding';

type ContentUiSurface = 'app' | 'overlay';

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
  const appContainer =
    (shadowRoot.getElementById(CONTENT_APP_CONTAINER_ID) as HTMLDivElement | null) ??
    createContentSurfaceRoot(shadowRoot, 'app');
  const overlayRoot =
    (shadowRoot.getElementById(CONTENT_OVERLAY_ROOT_ID) as HTMLDivElement | null) ??
    createContentSurfaceRoot(shadowRoot, 'overlay');

  if (!appContainer.isConnected) {
    shadowRoot.appendChild(appContainer);
  }

  if (!overlayRoot.isConnected) {
    shadowRoot.appendChild(overlayRoot);
  }

  return { appContainer, overlayRoot };
}
