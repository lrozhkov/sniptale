import type { Canvas } from 'fabric';

import { isBrowserFrameObject } from '../../../../document/model';

export function hasBrowserFrameLayer(canvas: Canvas | null): boolean {
  return (canvas?.getObjects?.() ?? []).some((object) => isBrowserFrameObject(object));
}
