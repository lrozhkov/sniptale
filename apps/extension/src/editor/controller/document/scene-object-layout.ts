import type { Canvas, FabricObject } from 'fabric';

import type { SourceState } from '../../document/model/source-state';
import {
  isBackgroundObject,
  isBrowserFrameObject,
  isUserObject,
  MIN_CANVAS_SIZE,
} from '../../document/model';

function resolveBrowserFrameObjectScale(args: {
  object: FabricObject;
  layoutSource: {
    width: number;
  };
  sourceSizeChanged: boolean;
}) {
  const measuredWidth = args.object.getScaledWidth();
  const measuredHeight = args.object.getScaledHeight();
  const currentWidth =
    Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : args.layoutSource.width;
  const currentHeight =
    Number.isFinite(measuredHeight) && measuredHeight > 0
      ? measuredHeight
      : Math.max(1, Number.isFinite(args.object.height) ? args.object.height : 1);
  const baseWidth =
    Number.isFinite(args.object.width) && args.object.width > 0
      ? args.object.width
      : Math.max(1, currentWidth);
  const baseHeight =
    Number.isFinite(args.object.height) && args.object.height > 0
      ? args.object.height
      : currentHeight;
  const scaledWidth = args.sourceSizeChanged ? args.layoutSource.width : currentWidth;
  const scaledHeight = args.sourceSizeChanged
    ? (currentHeight * args.layoutSource.width) / Math.max(1, currentWidth)
    : currentHeight;

  return {
    scaleX: Math.max(1, scaledWidth) / baseWidth,
    scaleY: scaledHeight / baseHeight,
  };
}

export function updateUserObjectLayout(options: {
  canvas: Canvas;
  currentSource: SourceState;
  sourceSizeChanged: boolean;
  layoutSource: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}): void {
  const { canvas, currentSource, layoutSource } = options;
  const safeCurrentWidth = Math.max(MIN_CANVAS_SIZE, currentSource.displayWidth);
  const safeCurrentHeight = Math.max(MIN_CANVAS_SIZE, currentSource.displayHeight);
  const ratioX = layoutSource.width / safeCurrentWidth;
  const ratioY = layoutSource.height / safeCurrentHeight;
  const deltaX = layoutSource.left - currentSource.left;
  const deltaY = layoutSource.top - currentSource.top;

  canvas.getObjects().forEach((object) => {
    if (!isUserObject(object) || isBackgroundObject(object)) {
      return;
    }

    if (isBrowserFrameObject(object)) {
      const browserFrameScale = resolveBrowserFrameObjectScale({
        object,
        layoutSource,
        sourceSizeChanged: options.sourceSizeChanged,
      });

      object.set({
        left: (object.left ?? 0) + deltaX,
        top: (object.top ?? 0) + deltaY,
        ...browserFrameScale,
      });
      object.setCoords();
      return;
    }

    object.set({
      left: layoutSource.left + ((object.left ?? 0) - currentSource.left) * ratioX,
      top: layoutSource.top + ((object.top ?? 0) - currentSource.top) * ratioY,
      scaleX: (object.scaleX ?? 1) * ratioX,
      scaleY: (object.scaleY ?? 1) * ratioY,
    });
    object.setCoords();
  });
}
