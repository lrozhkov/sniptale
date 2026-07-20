import { Point, type Textbox } from 'fabric';
import type { EditorTextCalloutFormat } from '../../../../features/editor/document/text';
import { getTextCalloutSurfaceSize } from './geometry';

type GeometryTextbox = Textbox & {
  _getNonTransformedDimensions: () => Point;
  _getTransformedDimensions: (options?: Record<string, unknown>) => Point;
  sniptaleTextCalloutGeometryAttached?: boolean;
  translateToGivenOrigin: (
    point: Point,
    fromOriginX: unknown,
    fromOriginY: unknown,
    toOriginX: unknown,
    toOriginY: unknown
  ) => Point;
};

export function normalizeTextCalloutFormat(value: unknown): EditorTextCalloutFormat {
  switch (value) {
    case 'plain':
    case 'panel':
    case 'bubble':
    case 'arrow-bubble':
    case 'pointer':
    case 'flag':
      return value;
    default:
      return 'bubble';
  }
}

function resolveOrigin(origin: unknown): number {
  switch (origin) {
    case 'left':
    case 'top':
      return -0.5;
    case 'right':
    case 'bottom':
      return 0.5;
    default:
      return 0;
  }
}

function createNonTransformedDimensionsOverride() {
  return function getCalloutDimensions(this: GeometryTextbox) {
    const surface = getTextCalloutSurfaceSize(
      this,
      normalizeTextCalloutFormat(this.sniptaleTextCalloutFormat)
    );
    return new Point(surface.width, surface.height).scalarAdd(this.strokeWidth ?? 0);
  };
}

function createTransformedDimensionsOverride(
  getTransformedDimensions: (options?: Record<string, unknown>) => Point
) {
  return function getCalloutTransformedDimensions(
    this: GeometryTextbox,
    options: Record<string, unknown> = {}
  ) {
    const surface = getTextCalloutSurfaceSize(
      this,
      normalizeTextCalloutFormat(this.sniptaleTextCalloutFormat)
    );
    return getTransformedDimensions({
      ...options,
      height: surface.height,
      width: surface.width,
    });
  };
}

function createTranslateToGivenOriginOverride(
  getTransformedDimensions: (options?: Record<string, unknown>) => Point
) {
  return function translateCalloutToOrigin(
    this: GeometryTextbox,
    point: Point,
    fromOriginX: unknown,
    fromOriginY: unknown,
    toOriginX: unknown,
    toOriginY: unknown
  ) {
    const offsetX = resolveOrigin(toOriginX) - resolveOrigin(fromOriginX);
    const offsetY = resolveOrigin(toOriginY) - resolveOrigin(fromOriginY);
    if (offsetX === 0 && offsetY === 0) {
      return point;
    }

    const surface = getTextCalloutSurfaceSize(
      this,
      normalizeTextCalloutFormat(this.sniptaleTextCalloutFormat)
    );
    const baseDimensions = getTransformedDimensions({
      height: surface.height,
      width: surface.width,
    });

    return new Point(point.x + offsetX * baseDimensions.x, point.y + offsetY * baseDimensions.y);
  };
}

export function attachTextCalloutGeometry(textbox: Textbox): void {
  const renderable = textbox as GeometryTextbox;
  if (renderable.sniptaleTextCalloutGeometryAttached) {
    return;
  }

  const getTransformedDimensions = renderable._getTransformedDimensions.bind(renderable);
  renderable._getNonTransformedDimensions = createNonTransformedDimensionsOverride();
  renderable._getTransformedDimensions =
    createTransformedDimensionsOverride(getTransformedDimensions);
  renderable.translateToGivenOrigin =
    createTranslateToGivenOriginOverride(getTransformedDimensions);
  renderable.sniptaleTextCalloutGeometryAttached = true;
}
