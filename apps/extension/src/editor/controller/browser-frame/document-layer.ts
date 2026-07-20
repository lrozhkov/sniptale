import type { Canvas, FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../features/editor/document/types';
import { createBrowserFrameLayerObject } from '../../objects/browser-frame';

import type { SourceState } from '../../document/model/source-state';

export function replaceBrowserFrameLayer(
  canvas: Canvas,
  previous: FabricObject,
  next: FabricObject
): void {
  const previousIndex = canvas.getObjects().indexOf(previous);
  const wasActive = canvas.getActiveObjects().some((object) => object === previous);

  canvas.remove(previous);
  canvas.add(next);
  if (previousIndex >= 0) {
    canvas.moveObjectTo(next, previousIndex);
  }
  if (wasActive) {
    canvas.setActiveObject(next);
  }
}

export function prepareBrowserFrameLayerReplacement(args: {
  header: FabricObject;
  browserFrame: BrowserFrameState;
  nextSource: SourceState;
}): Promise<FabricObject> {
  return createBrowserFrameLayerObject({
    browserFrame: args.browserFrame,
    existingObject: args.header,
    left: args.header.left ?? args.nextSource.left,
    nextLabelIndex: 1,
    prepareObject: (object) => {
      if (args.header.sniptaleId !== undefined) {
        object.sniptaleId = args.header.sniptaleId;
      }
      if (args.header.sniptaleLabel !== undefined) {
        object.sniptaleLabel = args.header.sniptaleLabel;
      }
      if (args.header.sniptaleLocked !== undefined) {
        object.sniptaleLocked = args.header.sniptaleLocked;
      }
      object.visible = args.header.visible;
    },
    top: args.header.top ?? args.nextSource.top,
    width: args.header.getScaledWidth(),
  });
}
