import type { Canvas, FabricObject } from 'fabric';

import type { SourceState } from '../../../../document/model/source-state';
import { isBrowserFrameObject } from '../../../../document/model';

export function findBrowserFrameLayer(canvas: Canvas): FabricObject | null {
  return canvas.getObjects?.().find((object) => isBrowserFrameObject(object)) ?? null;
}

export function replaceBrowserFrameLayer(
  canvas: Canvas,
  previous: FabricObject | null,
  next: FabricObject
): void {
  const previousIndex = previous ? (canvas.getObjects?.() ?? []).indexOf(previous) : -1;
  if (previous) {
    canvas.remove(previous);
  }

  canvas.add(next);
  if (previousIndex >= 0) {
    canvas.moveObjectTo(next, previousIndex);
  } else {
    canvas.bringObjectToFront(next);
  }
  canvas.setActiveObject(next);
  next.setCoords();
}

export function resolveBrowserFrameWidth(
  existingLayer: FabricObject | null,
  source: SourceState
): number {
  return existingLayer ? existingLayer.getScaledWidth() : source.displayWidth;
}
