import { Control, controlsUtils } from 'fabric';

import { createCalloutActionHandler, createCalloutPositionHandler } from './handlers';
import type { CalloutControlKey, RichShapeCalloutGroup, UpdateRichShapeCallout } from './types';

const CALLOUT_CONTROL_SIZE = 15;
const CALLOUT_CONTROL_TOUCH_SIZE = 24;

function createCalloutControl(key: CalloutControlKey, update: UpdateRichShapeCallout): Control {
  return new Control({
    actionName: 'modifyCalloutTail',
    sizeX: CALLOUT_CONTROL_SIZE,
    sizeY: CALLOUT_CONTROL_SIZE,
    touchSizeX: CALLOUT_CONTROL_TOUCH_SIZE,
    touchSizeY: CALLOUT_CONTROL_TOUCH_SIZE,
    cursorStyle: 'pointer',
    positionHandler: createCalloutPositionHandler(key),
    actionHandler: createCalloutActionHandler(key, update),
  });
}

export function createRichShapeCalloutControls(
  object: RichShapeCalloutGroup,
  update: UpdateRichShapeCallout
): Record<string, Control> {
  if (!object.sniptaleRichShape.callout) {
    return controlsUtils.createObjectDefaultControls();
  }

  return {
    ...controlsUtils.createObjectDefaultControls(),
    calloutBaseStart: createCalloutControl('baseStart', update),
    calloutBaseEnd: createCalloutControl('baseEnd', update),
    calloutTip: createCalloutControl('tip', update),
  };
}
