type FrameAnnotationPoint = { x: number; y: number };
type FrameAnnotationRect = FrameAnnotationPoint & { width: number; height: number };

export interface FrameAnnotationCoordinateSpace {
  readonly viewport: { width: number; height: number };
  clientPointToLogical(point: FrameAnnotationPoint): FrameAnnotationPoint;
  clientRectToLogical(rect: FrameAnnotationRect): FrameAnnotationRect;
  logicalPointToClient(point: FrameAnnotationPoint): FrameAnnotationPoint;
  logicalRectToClient(rect: FrameAnnotationRect): FrameAnnotationRect;
}

function createIdentityFrameAnnotationCoordinateSpace(): FrameAnnotationCoordinateSpace {
  return {
    get viewport() {
      return { width: window.innerWidth, height: window.innerHeight };
    },
    clientPointToLogical: (point) => point,
    clientRectToLogical: (rect) => rect,
    logicalPointToClient: (point) => point,
    logicalRectToClient: (rect) => rect,
  };
}

export const identityFrameAnnotationCoordinateSpace =
  createIdentityFrameAnnotationCoordinateSpace();

export function createScaledFrameAnnotationCoordinateSpace(args: {
  origin: FrameAnnotationPoint;
  scale: number;
  viewport: { width: number; height: number };
}): FrameAnnotationCoordinateSpace {
  const scale = Number.isFinite(args.scale) && args.scale > 0 ? args.scale : 1;
  return {
    viewport: args.viewport,
    clientPointToLogical: (point) => ({
      x: (point.x - args.origin.x) / scale,
      y: (point.y - args.origin.y) / scale,
    }),
    clientRectToLogical: (rect) => ({
      x: (rect.x - args.origin.x) / scale,
      y: (rect.y - args.origin.y) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    }),
    logicalPointToClient: (point) => ({
      x: args.origin.x + point.x * scale,
      y: args.origin.y + point.y * scale,
    }),
    logicalRectToClient: (rect) => ({
      x: args.origin.x + rect.x * scale,
      y: args.origin.y + rect.y * scale,
      width: rect.width * scale,
      height: rect.height * scale,
    }),
  };
}

export function domRectToFrameAnnotationRect(rect: DOMRect): FrameAnnotationRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}
