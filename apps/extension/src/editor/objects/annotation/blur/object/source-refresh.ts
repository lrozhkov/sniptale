import type { Canvas } from 'fabric';

import type { SourceState } from '../../../../document/model/source-state';
import { isBlurObject } from './identity';
import { updateBlurObject } from './update';

export function refreshBlurObjectsForSource(
  canvas: Canvas | null,
  source: SourceState | null
): void {
  if (!canvas || !source) {
    return;
  }

  canvas.getObjects().forEach((object) => {
    if (!isBlurObject(object)) {
      return;
    }

    updateBlurObject(object, { source });
  });
}
