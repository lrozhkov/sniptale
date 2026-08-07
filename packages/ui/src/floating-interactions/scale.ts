export const CONTENT_UI_SCALE_PROPERTY = '--sniptale-content-ui-scale';
export const CONTENT_UI_VIEWPORT_HEIGHT_PROPERTY = '--sniptale-content-ui-viewport-height';
export const CONTENT_UI_VIEWPORT_WIDTH_PROPERTY = '--sniptale-content-ui-viewport-width';

// Chrome desktop supports page zoom through 500%, whose exact inverse is 0.2.
// Clamping above that value makes extension chrome visibly grow at the maximum zoom.
const MIN_CONTENT_UI_SCALE = 0.2;
const MAX_CONTENT_UI_SCALE = 4;

function normalizePositiveScale(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

export function resolveContentUiScaleCompensation(input: {
  baselineDevicePixelRatio: number;
  currentDevicePixelRatio: number;
  visualViewportScale?: number;
}): number {
  const baseline = normalizePositiveScale(input.baselineDevicePixelRatio);
  const current = normalizePositiveScale(input.currentDevicePixelRatio);
  const viewportScale = normalizePositiveScale(input.visualViewportScale);
  const compensation = baseline / current / viewportScale;
  return Math.max(MIN_CONTENT_UI_SCALE, Math.min(MAX_CONTENT_UI_SCALE, compensation));
}

export function readContentUiScaleCompensation(node: Node | null): number {
  if (!node) return 1;
  let current = node instanceof Element ? node : null;
  while (current) {
    if (current instanceof HTMLElement) {
      const inlineValue = current.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY);
      if (inlineValue) return normalizePositiveScale(Number.parseFloat(inlineValue));
    }
    current = current.parentElement;
  }
  const root = node.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    const hostValue = root.host.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY);
    if (hostValue) return normalizePositiveScale(Number.parseFloat(hostValue));
  }
  const element = node instanceof Element ? node : root instanceof ShadowRoot ? root.host : null;
  const value = element
    ? element.ownerDocument.defaultView
        ?.getComputedStyle(element)
        .getPropertyValue(CONTENT_UI_SCALE_PROPERTY)
    : undefined;
  return normalizePositiveScale(value === undefined ? undefined : Number.parseFloat(value));
}

export function resolveContentUiViewport(input: {
  clientHeight: number;
  clientWidth: number;
  scale: number;
}): { height: number; width: number } {
  const scale = normalizePositiveScale(input.scale);
  return {
    height: Math.max(0, input.clientHeight) / scale,
    width: Math.max(0, input.clientWidth) / scale,
  };
}

export function projectClientPointToContentUi<T extends { x: number; y: number }>(
  point: T,
  scale: number
): T {
  const normalizedScale = normalizePositiveScale(scale);
  return { ...point, x: point.x / normalizedScale, y: point.y / normalizedScale };
}

export function projectContentUiPointToClient<T extends { x: number; y: number }>(
  point: T,
  scale: number
): T {
  const normalizedScale = normalizePositiveScale(scale);
  return { ...point, x: point.x * normalizedScale, y: point.y * normalizedScale };
}

export function projectClientRectToContentUi<
  T extends { x: number; y: number; width: number; height: number },
>(rect: T, scale: number): T {
  const normalizedScale = normalizePositiveScale(scale);
  return {
    ...rect,
    x: rect.x / normalizedScale,
    y: rect.y / normalizedScale,
    width: rect.width / normalizedScale,
    height: rect.height / normalizedScale,
  };
}
