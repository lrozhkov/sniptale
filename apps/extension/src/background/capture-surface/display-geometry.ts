interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

function intersectionArea(left: Rectangle, right: Rectangle): number {
  const width = Math.max(
    0,
    Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left)
  );
  const height = Math.max(
    0,
    Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top)
  );
  return width * height;
}

export function selectDisplayForWindow(
  windowBounds: Rectangle,
  displays: readonly chrome.system.display.DisplayUnitInfo[]
): chrome.system.display.DisplayUnitInfo | null {
  const ranked = displays
    .map((display) => ({ display, area: intersectionArea(windowBounds, display.bounds) }))
    .sort((left, right) => right.area - left.area);
  if (ranked[0]?.area) return ranked[0].display;
  return displays.find((display) => display.isPrimary) ?? displays[0] ?? null;
}

export function doesSizeFit(bounds: Rectangle, width: number, height: number): boolean {
  return width <= bounds.width && height <= bounds.height;
}

export function clampWindowPosition(
  workArea: Rectangle,
  requested: Pick<Rectangle, 'left' | 'top' | 'width' | 'height'>
): { left: number; top: number } {
  return {
    left: Math.min(
      Math.max(requested.left, workArea.left),
      workArea.left + workArea.width - requested.width
    ),
    top: Math.min(
      Math.max(requested.top, workArea.top),
      workArea.top + workArea.height - requested.height
    ),
  };
}
