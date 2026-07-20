import type { Canvas, FabricObject } from 'fabric';

export function findBrowserFrameHeader(canvas: Canvas | null): FabricObject | undefined {
  return canvas?.getObjects().find((object) => object.sniptaleType === 'browser-frame');
}
