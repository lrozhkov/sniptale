import { type Point, type Textbox } from 'fabric';
import {
  getTextCalloutBodyRect,
  getTextCalloutContentRect,
  getTextCalloutSurfaceSize,
} from './geometry';
import { normalizeTextCalloutFormat } from './interaction';

type TextCalloutPointerZone = 'content' | 'handle' | 'outside' | 'surface';

interface LocalRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

type ZonedTextbox = Textbox & {
  angle?: number;
  findControl?: (pointer: Point) => unknown;
  getRelativeCenterPoint: () => Point;
  translateToGivenOrigin: (
    point: Point,
    fromOriginX: unknown,
    fromOriginY: unknown,
    toOriginX: unknown,
    toOriginY: unknown
  ) => Point;
};

function rotatePointIntoLocalPlane(
  point: Point,
  center: Point,
  angle: number | undefined
): { x: number; y: number } {
  if (!angle) {
    return { x: point.x, y: point.y };
  }

  const radians = (-angle * Math.PI) / 180;
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: center.x + deltaX * cosine - deltaY * sine,
    y: center.y + deltaX * sine + deltaY * cosine,
  };
}

function isPointInRect(point: { x: number; y: number }, rect: LocalRect): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

function getLocalSurfacePoint(textbox: ZonedTextbox, scenePoint: Point): { x: number; y: number } {
  const center = textbox.getRelativeCenterPoint();
  const topLeft = textbox.translateToGivenOrigin(center, 'center', 'center', 'left', 'top');
  const rotatedPoint = rotatePointIntoLocalPlane(scenePoint, center, textbox.angle);

  return {
    x: rotatedPoint.x - topLeft.x,
    y: rotatedPoint.y - topLeft.y,
  };
}

export function getTextCalloutInteractionLayout(textbox: Textbox): {
  body: LocalRect;
  content: LocalRect;
  surface: LocalRect;
} {
  const format = normalizeTextCalloutFormat(textbox.sniptaleTextCalloutFormat);
  const surfaceSize = getTextCalloutSurfaceSize(textbox, format);
  const body = getTextCalloutBodyRect(surfaceSize, format);
  const content = getTextCalloutContentRect(surfaceSize, textbox, format);

  return {
    body,
    content,
    surface: {
      height: surfaceSize.height,
      left: 0,
      top: 0,
      width: surfaceSize.width,
    },
  };
}

export function resolveTextCalloutPointerZone(options: {
  scenePoint: Point;
  textbox: Textbox;
  viewportPoint?: Point;
}): TextCalloutPointerZone {
  const textbox = options.textbox as ZonedTextbox;
  if (
    options.viewportPoint &&
    typeof textbox.findControl === 'function' &&
    textbox.findControl(options.viewportPoint)
  ) {
    return 'handle';
  }

  const localPoint = getLocalSurfacePoint(textbox, options.scenePoint);
  const layout = getTextCalloutInteractionLayout(options.textbox);
  if (!isPointInRect(localPoint, layout.surface)) {
    return 'outside';
  }

  return isPointInRect(localPoint, layout.content) ? 'content' : 'surface';
}
