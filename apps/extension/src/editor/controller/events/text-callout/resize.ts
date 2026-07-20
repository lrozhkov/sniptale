import { Point, type Textbox, type Transform } from 'fabric';
import { getScaledTextCalloutResizeDimensions } from '../../../objects/annotation/text/callout/dimensions';
import { resizeTextCallout } from '../../../objects/annotation/text/callout/resize';

type HoverableTextCallout = Textbox & {
  getBoundingRect: () => { height: number; left: number; top: number; width: number };
  getPositionByOrigin?: (
    originX: 'center' | 'left' | 'right',
    originY: 'bottom' | 'center' | 'top'
  ) => Point;
  set: (options: { left?: number; top?: number }) => void;
  setPositionByOrigin?: (
    point: Point,
    originX: 'center' | 'left' | 'right',
    originY: 'bottom' | 'center' | 'top'
  ) => void;
};

function resolveTransformOrigin(transform: Pick<Transform, 'originX' | 'originY'> | undefined): {
  originX: 'center' | 'left' | 'right';
  originY: 'bottom' | 'center' | 'top';
} {
  const originX =
    transform?.originX === 'center' || transform?.originX === 'right' ? transform.originX : 'left';
  const originY =
    transform?.originY === 'bottom' || transform?.originY === 'center' ? transform.originY : 'top';

  return { originX, originY };
}

function hasLocalTextCalloutMetrics(textCallout: HoverableTextCallout): boolean {
  return (
    typeof textCallout.width === 'number' ||
    typeof textCallout.height === 'number' ||
    typeof textCallout.sniptaleTextCalloutWidth === 'number' ||
    typeof textCallout.sniptaleTextCalloutHeight === 'number'
  );
}

function resolveTextCalloutResizeSize(
  textCallout: HoverableTextCallout,
  bounds: ReturnType<HoverableTextCallout['getBoundingRect']>,
  origin: ReturnType<typeof resolveTransformOrigin>
): { height: number; width: number } {
  if (!hasLocalTextCalloutMetrics(textCallout)) {
    return { height: bounds.height, width: bounds.width };
  }

  return getScaledTextCalloutResizeDimensions(textCallout, {
    preserveStoredWidth: origin.originX === 'center',
  });
}

function resolveAnchorPoint(
  textCallout: HoverableTextCallout,
  bounds: ReturnType<HoverableTextCallout['getBoundingRect']>,
  origin: ReturnType<typeof resolveTransformOrigin>
): Point {
  if (typeof textCallout.getPositionByOrigin === 'function') {
    return textCallout.getPositionByOrigin(origin.originX, origin.originY);
  }

  const x =
    origin.originX === 'right'
      ? bounds.left + bounds.width
      : origin.originX === 'center'
        ? bounds.left + bounds.width / 2
        : bounds.left;
  const y =
    origin.originY === 'bottom'
      ? bounds.top + bounds.height
      : origin.originY === 'center'
        ? bounds.top + bounds.height / 2
        : bounds.top;

  return new Point(x, y);
}

export function normalizeScaledTextCalloutTarget(
  target: Textbox,
  transform?: Pick<Transform, 'originX' | 'originY'>
): void {
  const textCallout = target as HoverableTextCallout;
  const bounds = textCallout.getBoundingRect();
  const origin = resolveTransformOrigin(transform);
  const anchorPoint = resolveAnchorPoint(textCallout, bounds, origin);
  const resizeSize = resolveTextCalloutResizeSize(textCallout, bounds, origin);

  resizeTextCallout(textCallout, resizeSize.width, resizeSize.height);
  if (typeof textCallout.setPositionByOrigin === 'function') {
    textCallout.setPositionByOrigin(anchorPoint, origin.originX, origin.originY);
  } else {
    textCallout.set({ left: bounds.left, top: bounds.top });
  }
  textCallout.setCoords();
}
