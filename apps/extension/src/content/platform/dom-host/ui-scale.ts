import {
  CONTENT_UI_SCALE_PROPERTY,
  CONTENT_UI_VIEWPORT_HEIGHT_PROPERTY,
  CONTENT_UI_VIEWPORT_WIDTH_PROPERTY,
  resolveContentUiScaleCompensation,
  resolveContentUiViewport,
} from '@sniptale/ui/floating-interactions/scale';

export {
  CONTENT_UI_SCALE_PROPERTY,
  CONTENT_UI_VIEWPORT_HEIGHT_PROPERTY,
  CONTENT_UI_VIEWPORT_WIDTH_PROPERTY,
  readContentUiScaleCompensation,
  resolveContentUiScaleCompensation,
} from '@sniptale/ui/floating-interactions/scale';

function normalizePositiveScale(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

// policyStateIds: [] - document-local UI scale geometry and listeners grant no capability or authorization.
let currentContentUiScale = 1;
const contentUiScaleListeners = new Set<() => void>();
let applyCurrentPageZoom: ((pageZoom: number) => void) | null = null;
let pageZoomRevision = 0;

export function getContentUiScaleSnapshot(): number {
  return currentContentUiScale;
}

export function subscribeContentUiScale(listener: () => void): () => void {
  contentUiScaleListeners.add(listener);
  return () => contentUiScaleListeners.delete(listener);
}

function publishContentUiScale(scale: number): void {
  if (scale === currentContentUiScale) return;
  currentContentUiScale = scale;
  contentUiScaleListeners.forEach((listener) => listener());
}

/** Seeds the compensation with Chrome's exact tab zoom without cancelling operating-system DPI. */
export function setContentUiPageZoom(pageZoom: number): void {
  if (!Number.isFinite(pageZoom) || pageZoom <= 0) return;
  pageZoomRevision += 1;
  applyCurrentPageZoom?.(pageZoom);
}

export function getContentUiPageZoomRevision(): number {
  return pageZoomRevision;
}

export function setContentUiPageZoomAtRevision(pageZoom: number, revision: number): boolean {
  if (revision !== pageZoomRevision) return false;
  setContentUiPageZoom(pageZoom);
  return true;
}

/**
 * Keeps extension-owned interaction chrome physically stable while the host page zoom changes.
 * Page geometry remains unscaled; owned styles apply this factor only to chrome surfaces.
 */
export function installContentUiScaleCompensation(host: HTMLElement): () => void {
  const ownerWindow = host.ownerDocument.defaultView;
  if (!ownerWindow) return () => undefined;

  let baselineDevicePixelRatio = normalizePositiveScale(ownerWindow.devicePixelRatio);
  const syncScale = () => {
    const visualViewportScale = ownerWindow.visualViewport?.scale;
    const scale = resolveContentUiScaleCompensation({
      baselineDevicePixelRatio,
      currentDevicePixelRatio: ownerWindow.devicePixelRatio,
      ...(visualViewportScale === undefined ? {} : { visualViewportScale }),
    });
    host.style.setProperty(CONTENT_UI_SCALE_PROPERTY, String(scale));
    const viewport = resolveContentUiViewport({
      clientHeight: ownerWindow.innerHeight,
      clientWidth: ownerWindow.innerWidth,
      scale,
    });
    host.style.setProperty(CONTENT_UI_VIEWPORT_HEIGHT_PROPERTY, `${viewport.height}px`);
    host.style.setProperty(CONTENT_UI_VIEWPORT_WIDTH_PROPERTY, `${viewport.width}px`);
    publishContentUiScale(scale);
  };

  applyCurrentPageZoom = (pageZoom) => {
    baselineDevicePixelRatio =
      normalizePositiveScale(ownerWindow.devicePixelRatio) / normalizePositiveScale(pageZoom);
    syncScale();
  };

  syncScale();
  ownerWindow.addEventListener('resize', syncScale);
  ownerWindow.visualViewport?.addEventListener('resize', syncScale);

  return () => {
    ownerWindow.removeEventListener('resize', syncScale);
    ownerWindow.visualViewport?.removeEventListener('resize', syncScale);
    host.style.removeProperty(CONTENT_UI_SCALE_PROPERTY);
    host.style.removeProperty(CONTENT_UI_VIEWPORT_HEIGHT_PROPERTY);
    host.style.removeProperty(CONTENT_UI_VIEWPORT_WIDTH_PROPERTY);
    applyCurrentPageZoom = null;
    publishContentUiScale(1);
  };
}
