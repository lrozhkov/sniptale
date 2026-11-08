import { Point, Textbox, type Canvas, type FabricObject } from 'fabric';
import { synchronizeEditorDrawingObjectFromFabric } from '../../drawing/object/metadata';
import { applyEditorDrawingTextVisuals } from '../../drawing/object/vector';
import { normalizeFrameAnnotationProxyGeometry } from '../../frame-annotation/proxy';

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

function isSceneTextBox(object: FabricObject): object is Textbox {
  return object instanceof Textbox;
}

function synchronizeSceneDrawing(
  object: FabricObject,
  transform: { x: number; y: number; scaleX: number; scaleY: number }
): void {
  const drawing = synchronizeEditorDrawingObjectFromFabric(object, transform);
  if (drawing?.kind !== 'text' || !isSceneTextBox(object)) return;
  const center = object.getCenterPoint();
  const automaticWidth = object.sniptaleDrawingTextAutoWidth;
  object.set({
    fontSize: drawing.fontSize,
    width: Math.max(1, drawing.bounds.width),
    scaleX: 1,
    scaleY: 1,
  });
  // Text padding has a fixed scene size, including after a history restore.
  object.sniptaleDrawingTextAutoWidth = false;
  try {
    applyEditorDrawingTextVisuals(object);
  } finally {
    if (automaticWidth === undefined) delete object.sniptaleDrawingTextAutoWidth;
    else object.sniptaleDrawingTextAutoWidth = automaticWidth;
  }
  if (drawing.rotation)
    object.setPositionByOrigin(new Point(center.x, center.y), 'center', 'center');
  else object.set({ left: drawing.bounds.x, top: drawing.bounds.y });
  object.setCoords();
  synchronizeEditorDrawingObjectFromFabric(object);
}

export function updateUserObjectLayout(options: {
  canvas: Canvas;
  currentSource: SourceState;
  sourceSizeChanged: boolean;
  header?: { left: number; top: number; width: number; height: number } | null;
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
        left: options.header?.left ?? (object.left ?? 0) + deltaX,
        top: options.header?.top ?? (object.top ?? 0) + deltaY,
        ...browserFrameScale,
        ...(options.header
          ? {
              scaleX: options.header.width / object.width,
              scaleY: options.header.height / object.height,
            }
          : {}),
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
    normalizeFrameAnnotationProxyGeometry(object);
    synchronizeSceneDrawing(object, {
      x: layoutSource.left - currentSource.left * ratioX,
      y: layoutSource.top - currentSource.top * ratioY,
      scaleX: ratioX,
      scaleY: ratioY,
    });
  });
}
