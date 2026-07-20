import { Group, Point, type Control } from 'fabric';

import { toCalloutShapePoint, toCalloutViewportPoint } from './coordinates';
import {
  createCalloutBasePatch,
  createCalloutTipPatch,
  getCalloutBasePoint,
  resolveCalloutGeometry,
} from './patch';
import type { CalloutControlKey, RichShapeCalloutGroup, UpdateRichShapeCallout } from './types';

export function createCalloutPositionHandler(key: CalloutControlKey): Control['positionHandler'] {
  return (_dim, _finalMatrix, fabricObject) => {
    if (!(fabricObject instanceof Group) || fabricObject.sniptaleType !== 'rich-shape') {
      return new Point(0, 0);
    }

    const object = fabricObject as RichShapeCalloutGroup;
    const callout = resolveCalloutGeometry(object.sniptaleRichShape);
    if (!callout) {
      return new Point(0, 0);
    }

    const point = key === 'tip' ? callout.tail.tip : getCalloutBasePoint(callout, key);
    return toCalloutViewportPoint(object, point);
  };
}

export function createCalloutActionHandler(
  key: CalloutControlKey,
  update: UpdateRichShapeCallout
): Control['actionHandler'] {
  return (_eventData, transform, x, y) => {
    const target = transform.target;
    if (!(target instanceof Group) || target.sniptaleType !== 'rich-shape') {
      return false;
    }

    const object = target as RichShapeCalloutGroup;
    const callout = resolveCalloutGeometry(object.sniptaleRichShape);
    if (!callout) {
      return false;
    }

    const point = toCalloutShapePoint(object, x, y);
    const nextCallout =
      key === 'tip'
        ? createCalloutTipPatch(callout, object.sniptaleRichShape.frame, point)
        : createCalloutBasePatch(callout, object.sniptaleRichShape, key, point);
    const updated = update(object, {
      ...object.sniptaleRichShape,
      callout: nextCallout,
    });
    object.set('dirty', true);
    return updated;
  };
}
