export interface ViewportEmulationResult {
  cssWidth: number;
  cssHeight: number;
}

const MAX_COMPOSITOR_SCALE_RELATIVE_DRIFT = 0.005;

export function buildDeviceMetricsOverrideParams(
  width: number,
  height: number,
  deviceScaleFactor: number
) {
  if (
    !isPositiveInteger(width) ||
    !isPositiveInteger(height) ||
    !isPositiveFinite(deviceScaleFactor)
  ) {
    throw new Error('Viewport override dimensions and compositor scale must be positive');
  }
  return {
    width,
    height,
    deviceScaleFactor,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
    positionX: 0,
    positionY: 0,
    scrollbarType: 'overlay',
  };
}

export function buildViewportCompositorScale(value: unknown): number {
  if (!isRecord(value)) return unavailableViewportCompositorMetrics();
  const physical = value['layoutViewport'];
  const css = value['cssLayoutViewport'];
  const visual = value['cssVisualViewport'];
  if (!isRecord(physical) || !isRecord(css) || !isRecord(visual)) {
    return unavailableViewportCompositorMetrics();
  }
  const physicalWidth = physical['clientWidth'];
  const physicalHeight = physical['clientHeight'];
  const cssWidth = css['clientWidth'];
  const cssHeight = css['clientHeight'];
  const zoom = visual['zoom'];
  if (
    !isPositiveInteger(physicalWidth) ||
    !isPositiveInteger(physicalHeight) ||
    !isPositiveInteger(cssWidth) ||
    !isPositiveInteger(cssHeight) ||
    !isPositiveFinite(zoom)
  ) {
    return unavailableViewportCompositorMetrics();
  }

  const cssToPhysical =
    (cssWidth * physicalWidth + cssHeight * physicalHeight) /
    (cssWidth * cssWidth + cssHeight * cssHeight);
  if (
    !isPositiveFinite(cssToPhysical) ||
    Math.abs(physicalWidth - cssWidth * cssToPhysical) > 1 ||
    Math.abs(physicalHeight - cssHeight * cssToPhysical) > 1
  ) {
    return unavailableViewportCompositorMetrics();
  }
  const compositorScale = cssToPhysical / zoom;
  return isPositiveFinite(compositorScale)
    ? compositorScale
    : unavailableViewportCompositorMetrics();
}

export function viewportCompositorScalesMatch(left: number, right: number): boolean {
  if (!isPositiveFinite(left) || !isPositiveFinite(right)) return false;
  return Math.abs(left - right) <= Math.max(left, right) * MAX_COMPOSITOR_SCALE_RELATIVE_DRIFT;
}

export function buildViewportEmulationResult(value: unknown): ViewportEmulationResult {
  if (!isRecord(value)) return unavailableViewportMetrics();
  if (isPositiveInteger(value['width']) && isPositiveInteger(value['height'])) {
    return {
      cssWidth: value['width'],
      cssHeight: value['height'],
    };
  }
  return unavailableViewportMetrics();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function unavailableViewportMetrics(): never {
  throw new Error(
    'Viewport verification failed: window.innerWidth/window.innerHeight are unavailable'
  );
}

function unavailableViewportCompositorMetrics(): never {
  throw new Error('Viewport compositor metrics are unavailable or inconsistent');
}
