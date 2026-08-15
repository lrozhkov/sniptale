function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

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
  if (!isRecord(value))
    throw new Error('Viewport compositor metrics are unavailable or inconsistent');
  const physical = value['layoutViewport'];
  const css = value['cssLayoutViewport'];
  const visual = value['cssVisualViewport'];
  if (!isRecord(physical) || !isRecord(css) || !isRecord(visual)) {
    throw new Error('Viewport compositor metrics are unavailable or inconsistent');
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
    throw new Error('Viewport compositor metrics are unavailable or inconsistent');
  }
  const cssToPhysical =
    (cssWidth * physicalWidth + cssHeight * physicalHeight) /
    (cssWidth * cssWidth + cssHeight * cssHeight);
  if (
    !isPositiveFinite(cssToPhysical) ||
    Math.abs(physicalWidth - cssWidth * cssToPhysical) > 1 ||
    Math.abs(physicalHeight - cssHeight * cssToPhysical) > 1
  ) {
    throw new Error('Viewport compositor metrics are unavailable or inconsistent');
  }
  const compositorScale = cssToPhysical / zoom;
  if (!isPositiveFinite(compositorScale)) {
    throw new Error('Viewport compositor metrics are unavailable or inconsistent');
  }
  return compositorScale;
}
