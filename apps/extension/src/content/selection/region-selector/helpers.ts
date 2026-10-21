export type RegionBounds = { x: number; y: number; width: number; height: number };
export const MIN_REGION_SELECTOR_SIZE = 100;

function evenSize(value: number, maximum: number): number {
  const max = Math.max(2, Math.floor(maximum / 2) * 2);
  return Math.min(
    max,
    Math.max(Math.min(MIN_REGION_SELECTOR_SIZE, max), Math.round(value / 2) * 2)
  );
}

export function resizeRegionWithAspectRatio(
  region: RegionBounds,
  dimension: 'width' | 'height',
  nextValue: number,
  ratio: number
): RegionBounds {
  const maxWidth = Math.min(window.innerWidth, window.innerHeight * ratio);
  const minWidth = Math.min(
    maxWidth,
    Math.max(MIN_REGION_SELECTOR_SIZE, MIN_REGION_SELECTOR_SIZE * ratio)
  );
  const width = evenSize(
    Math.max(minWidth, dimension === 'width' ? nextValue : nextValue * ratio),
    maxWidth
  );
  const height = evenSize(width / ratio, window.innerHeight);
  return resizeRegionDimension(resizeRegionDimension(region, 'width', width), 'height', height);
}

export function resizeRegionDimension(
  region: RegionBounds,
  dimension: 'width' | 'height',
  nextValue: number
): RegionBounds {
  const width = dimension === 'width' ? nextValue : region.width;
  const height = dimension === 'height' ? nextValue : region.height;
  const clampedWidth = evenSize(width, window.innerWidth);
  const clampedHeight = evenSize(height, window.innerHeight);
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;

  return {
    x: Math.min(Math.max(0, centerX - clampedWidth / 2), window.innerWidth - clampedWidth),
    y: Math.min(Math.max(0, centerY - clampedHeight / 2), window.innerHeight - clampedHeight),
    width: clampedWidth,
    height: clampedHeight,
  };
}

export function updateDraggingRegion(
  initialRegion: RegionBounds,
  currentRegion: RegionBounds,
  dragStart: { x: number; y: number },
  event: MouseEvent
): RegionBounds {
  const deltaX = event.clientX - dragStart.x;
  const deltaY = event.clientY - dragStart.y;
  return {
    ...currentRegion,
    x: Math.max(0, Math.min(window.innerWidth - currentRegion.width, initialRegion.x + deltaX)),
    y: Math.max(0, Math.min(window.innerHeight - currentRegion.height, initialRegion.y + deltaY)),
  };
}

export function updateResizingRegion(
  initialRegion: RegionBounds,
  currentRegion: RegionBounds,
  dragStart: { x: number; y: number },
  resizeCorner: string,
  event: MouseEvent,
  aspectRatio: number | null = null
): RegionBounds {
  const deltaX = event.clientX - dragStart.x;
  const deltaY = event.clientY - dragStart.y;
  const minSize = MIN_REGION_SELECTOR_SIZE;
  const nextRegion = updateResizeEdges({
    currentRegion,
    deltaX,
    deltaY,
    initialRegion,
    minSize,
    resizeCorner,
  });

  if (aspectRatio) {
    const anchorX = resizeCorner.includes('w')
      ? initialRegion.x + initialRegion.width
      : initialRegion.x;
    const anchorY = resizeCorner.includes('n')
      ? initialRegion.y + initialRegion.height
      : initialRegion.y;
    const maxWidth = Math.min(
      resizeCorner.includes('w') ? anchorX : window.innerWidth - anchorX,
      (resizeCorner.includes('n') ? anchorY : window.innerHeight - anchorY) * aspectRatio
    );
    const minWidth = Math.min(maxWidth, Math.max(minSize, minSize * aspectRatio));
    const requestedWidth =
      Math.abs(deltaX) >= Math.abs(deltaY * aspectRatio)
        ? nextRegion.width
        : nextRegion.height * aspectRatio;
    const width = evenSize(Math.max(minWidth, requestedWidth), maxWidth);
    const height = evenSize(
      width / aspectRatio,
      resizeCorner.includes('n') ? anchorY : window.innerHeight - anchorY
    );
    return {
      x: resizeCorner.includes('w') ? anchorX - width : anchorX,
      y: resizeCorner.includes('n') ? anchorY - height : anchorY,
      width,
      height,
    };
  }
  const clamped = clampResizedRegion(nextRegion, minSize);
  const width = evenSize(clamped.width, clamped.width);
  const height = evenSize(clamped.height, clamped.height);
  return {
    x: resizeCorner.includes('w') ? clamped.x + clamped.width - width : clamped.x,
    y: resizeCorner.includes('n') ? clamped.y + clamped.height - height : clamped.y,
    width,
    height,
  };
}

function updateResizeEdges(args: {
  currentRegion: RegionBounds;
  deltaX: number;
  deltaY: number;
  initialRegion: RegionBounds;
  minSize: number;
  resizeCorner: string;
}) {
  const nextRegion = { ...args.currentRegion };

  if (args.resizeCorner.includes('e')) {
    nextRegion.width = Math.max(args.minSize, args.initialRegion.width + args.deltaX);
  }
  if (args.resizeCorner.includes('w')) {
    const newWidth = Math.max(args.minSize, args.initialRegion.width - args.deltaX);
    if (newWidth >= args.minSize) {
      nextRegion.x = args.initialRegion.x + (args.initialRegion.width - newWidth);
      nextRegion.width = newWidth;
    }
  }
  if (args.resizeCorner.includes('s')) {
    nextRegion.height = Math.max(args.minSize, args.initialRegion.height + args.deltaY);
  }
  if (args.resizeCorner.includes('n')) {
    const newHeight = Math.max(args.minSize, args.initialRegion.height - args.deltaY);
    if (newHeight >= args.minSize) {
      nextRegion.y = args.initialRegion.y + (args.initialRegion.height - newHeight);
      nextRegion.height = newHeight;
    }
  }

  return nextRegion;
}

function clampResizedRegion(nextRegion: RegionBounds, minSize: number): RegionBounds {
  const maxWidth = window.innerWidth;
  const maxHeight = window.innerHeight;

  if (nextRegion.x < 0) {
    nextRegion.width = Math.max(minSize, nextRegion.width + nextRegion.x);
    nextRegion.x = 0;
  }

  if (nextRegion.y < 0) {
    nextRegion.height = Math.max(minSize, nextRegion.height + nextRegion.y);
    nextRegion.y = 0;
  }

  if (nextRegion.x + nextRegion.width > maxWidth) {
    nextRegion.width = Math.max(minSize, maxWidth - nextRegion.x);
  }

  if (nextRegion.y + nextRegion.height > maxHeight) {
    nextRegion.height = Math.max(minSize, maxHeight - nextRegion.y);
  }

  nextRegion.x = Math.max(0, Math.min(nextRegion.x, maxWidth - nextRegion.width));
  nextRegion.y = Math.max(0, Math.min(nextRegion.y, maxHeight - nextRegion.height));

  return nextRegion;
}
