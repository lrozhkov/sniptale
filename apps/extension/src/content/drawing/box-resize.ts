import {
  createDrawingBounds,
  type DrawingBounds,
  type DrawingPoint,
  type DrawingResizeHandle,
} from '../../features/drawing/public';

type BoxResizeHandle = Exclude<DrawingResizeHandle, 'start' | 'end'>;

type BoxResizeContext = {
  anchor: DrawingPoint;
  bounds: DrawingBounds;
  center: DrawingPoint;
  handle: BoxResizeHandle;
  point: DrawingPoint;
};

type DrawingBoxResizeModifiers = {
  ctrlKey: boolean;
  shiftKey: boolean;
};

function createBoxResizeContext(
  bounds: DrawingBounds,
  handle: BoxResizeHandle,
  point: DrawingPoint
): BoxResizeContext {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return {
    anchor: {
      x: handle.includes('w') ? right : bounds.x,
      y: handle.includes('n') ? bottom : bounds.y,
    },
    bounds,
    center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    handle,
    point,
  };
}

function resizeCornerWithAspect(context: BoxResizeContext, fromCenter: boolean): DrawingBounds {
  const { anchor, bounds, center, handle, point } = context;
  const origin = fromCenter ? center : anchor;
  const widthBasis = fromCenter ? bounds.width / 2 : bounds.width;
  const heightBasis = fromCenter ? bounds.height / 2 : bounds.height;
  const scale = Math.max(
    Math.abs(point.x - origin.x) / widthBasis,
    Math.abs(point.y - origin.y) / heightBasis
  );
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  if (fromCenter) {
    return { x: center.x - width / 2, y: center.y - height / 2, width, height };
  }
  return createDrawingBounds(anchor, {
    x: anchor.x + Math.sign(point.x - anchor.x || (handle.includes('w') ? -1 : 1)) * width,
    y: anchor.y + Math.sign(point.y - anchor.y || (handle.includes('n') ? -1 : 1)) * height,
  });
}

function resizeHorizontalWithAspect(context: BoxResizeContext, fromCenter: boolean): DrawingBounds {
  const { anchor, bounds, center, point } = context;
  const width = fromCenter ? Math.abs(point.x - center.x) * 2 : Math.abs(point.x - anchor.x);
  const height = bounds.height * (width / bounds.width);
  const x = fromCenter ? center.x - width / 2 : Math.min(anchor.x, point.x);
  return { x, y: center.y - height / 2, width, height };
}

function resizeVerticalWithAspect(context: BoxResizeContext, fromCenter: boolean): DrawingBounds {
  const { anchor, bounds, center, point } = context;
  const height = fromCenter ? Math.abs(point.y - center.y) * 2 : Math.abs(point.y - anchor.y);
  const width = bounds.width * (height / bounds.height);
  const y = fromCenter ? center.y - height / 2 : Math.min(anchor.y, point.y);
  return { x: center.x - width / 2, y, width, height };
}

function resizeWithoutAspect(context: BoxResizeContext, fromCenter: boolean): DrawingBounds {
  const { bounds, center, handle, point } = context;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const left = handle.includes('w')
    ? point.x
    : fromCenter && handle.includes('e')
      ? center.x * 2 - point.x
      : bounds.x;
  const top = handle.includes('n')
    ? point.y
    : fromCenter && handle.includes('s')
      ? center.y * 2 - point.y
      : bounds.y;
  const nextRight = handle.includes('e')
    ? point.x
    : fromCenter && handle.includes('w')
      ? center.x * 2 - point.x
      : right;
  const nextBottom = handle.includes('s')
    ? point.y
    : fromCenter && handle.includes('n')
      ? center.y * 2 - point.y
      : bottom;
  return createDrawingBounds({ x: left, y: top }, { x: nextRight, y: nextBottom });
}

export function resizeDrawingBox(args: {
  bounds: DrawingBounds;
  handle: BoxResizeHandle;
  modifiers: DrawingBoxResizeModifiers;
  point: DrawingPoint;
}): DrawingBounds {
  const context = createBoxResizeContext(args.bounds, args.handle, args.point);
  const preserveAspect = args.modifiers.shiftKey && args.bounds.width > 0 && args.bounds.height > 0;
  if (!preserveAspect) return resizeWithoutAspect(context, args.modifiers.ctrlKey);
  const horizontal = args.handle.includes('w') || args.handle.includes('e');
  const vertical = args.handle.includes('n') || args.handle.includes('s');
  if (horizontal && vertical) return resizeCornerWithAspect(context, args.modifiers.ctrlKey);
  if (horizontal) return resizeHorizontalWithAspect(context, args.modifiers.ctrlKey);
  return resizeVerticalWithAspect(context, args.modifiers.ctrlKey);
}
