function getCurrentDevicePixelRatio(): number {
  if (typeof window === 'undefined') {
    return 1;
  }

  return window.devicePixelRatio && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
}

export function getEditorViewportDevicePixelRatioBaseline(): number {
  return getCurrentDevicePixelRatio();
}

export function resolveEditorViewportScaleCompensation(devicePixelRatioBaseline?: number): number {
  const visualViewportScale =
    typeof window === 'undefined' ? undefined : window.visualViewport?.scale;
  if (visualViewportScale && Number.isFinite(visualViewportScale) && visualViewportScale > 0) {
    return Math.max(0.25, Math.min(4, 1 / visualViewportScale));
  }

  const baseline =
    devicePixelRatioBaseline && devicePixelRatioBaseline > 0
      ? devicePixelRatioBaseline
      : getCurrentDevicePixelRatio();

  return Math.max(0.25, Math.min(4, baseline / getCurrentDevicePixelRatio()));
}
