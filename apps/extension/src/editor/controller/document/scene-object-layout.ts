import type { Canvas, FabricObject } from 'fabric';

import type { SourceState } from '../../document/model/source-state';
import {
  BROWSER_HEADER_HEIGHT,
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
  const baseWidth = Math.max(
    1,
    args.object.width ?? args.object.getScaledWidth() ?? args.layoutSource.width
  );
  const baseHeight = Math.max(
    1,
    args.object.height ?? args.object.getScaledHeight() ?? BROWSER_HEADER_HEIGHT
  );
  const scaledWidth = args.sourceSizeChanged
    ? args.layoutSource.width
    : args.object.getScaledWidth();
  const scaledHeight = args.sourceSizeChanged
    ? BROWSER_HEADER_HEIGHT
    : args.object.getScaledHeight();

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
