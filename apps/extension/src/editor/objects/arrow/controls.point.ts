import { Control } from 'fabric';
import { getArrowEndpointIndex } from './controls-offsets/keys';
import { createArrowControlCursorHandler, createArrowControlRender } from './controls.render';
import { createArrowPointActionHandler } from './controls.point-action';
import { createArrowPointPositionHandler } from './controls.point-position';
import type { UpdateArrowObject } from './controls.types';

const ARROW_ENDPOINT_CONTROL_SIZE = 20;
const ARROW_POINT_CONTROL_SIZE = 18;
const ARROW_CONTROL_TOUCH_SIZE = 26;

export function createArrowPointControl(
  displayIndex: number,
  displayCount: number,
  controlKey: string,
  updateArrowObject: UpdateArrowObject
): Control {
  const endpointIndex = getArrowEndpointIndex(displayIndex, displayCount);
  const isEndpoint = endpointIndex !== null;

  return new Control({
    actionName: 'modifyArrow',
    sizeX: isEndpoint ? ARROW_ENDPOINT_CONTROL_SIZE : ARROW_POINT_CONTROL_SIZE,
    sizeY: isEndpoint ? ARROW_ENDPOINT_CONTROL_SIZE : ARROW_POINT_CONTROL_SIZE,
    touchSizeX: ARROW_CONTROL_TOUCH_SIZE,
    touchSizeY: ARROW_CONTROL_TOUCH_SIZE,
    cursorStyle: 'pointer',
    cursorStyleHandler: createArrowControlCursorHandler(controlKey, 'pointer'),
    positionHandler: createArrowPointPositionHandler(displayIndex),
    actionHandler: createArrowPointActionHandler(displayIndex, updateArrowObject),
    render: createArrowControlRender(controlKey, isEndpoint ? 'endpoint' : 'point'),
  });
}
