import { Control, controlsUtils, type FabricObject, type TransformActionHandler } from 'fabric';
import { createDrawingRotationControl, renderDrawingBoxHandle } from './chrome';

type BoxControlKey = 'tl' | 'mt' | 'tr' | 'mr' | 'br' | 'mb' | 'bl' | 'ml';

const DRAWING_BOX_CONTROL_SIZE = 18;
const BOX_CONTROL_POSITIONS: ReadonlyArray<[BoxControlKey, number, number]> = [
  ['tl', -0.5, -0.5],
  ['mt', 0, -0.5],
  ['tr', 0.5, -0.5],
  ['mr', 0.5, 0],
  ['br', 0.5, 0.5],
  ['mb', 0, 0.5],
  ['bl', -0.5, 0.5],
  ['ml', -0.5, 0],
];

function createProportionalSideScale(axis: 'x' | 'y'): TransformActionHandler {
  const scale: TransformActionHandler = (_event, transform, x, y) => {
    const { target } = transform;
    const point = controlsUtils.getLocalPoint(
      transform,
      transform.originX,
      transform.originY,
      x,
      y
    );
    const dimensions = target._getTransformedDimensions();
    const centered = transform.originX === 'center' && transform.originY === 'center';
    const centeredFactor = centered ? 2 : 1;
    const previousScaleX = target.scaleX;
    const previousScaleY = target.scaleY;
    if (axis === 'x') {
      const scaleX = Math.max(
        target.minScaleLimit,
        (Math.abs(point.x) * Math.abs(target.scaleX) * centeredFactor) /
          Math.max(0.001, dimensions.x)
      );
      const factor = scaleX / Math.max(0.001, Math.abs(transform.scaleX));
      target.set({ scaleX, scaleY: Math.abs(transform.scaleY) * factor });
    } else {
      const scaleY = Math.max(
        target.minScaleLimit,
        (Math.abs(point.y) * Math.abs(target.scaleY) * centeredFactor) /
          Math.max(0.001, dimensions.y)
      );
      const factor = scaleY / Math.max(0.001, Math.abs(transform.scaleY));
      target.set({ scaleX: Math.abs(transform.scaleX) * factor, scaleY });
    }
    return previousScaleX !== target.scaleX || previousScaleY !== target.scaleY;
  };
  return controlsUtils.wrapWithFireEvent('scaling', controlsUtils.wrapWithFixedAnchor(scale));
}

const scaleXProportionally = createProportionalSideScale('x');
const scaleYProportionally = createProportionalSideScale('y');

function resolveBoxActionHandler(object: FabricObject, key: BoxControlKey) {
  if (key === 'tl' || key === 'tr' || key === 'br' || key === 'bl') {
    return controlsUtils.scalingEqually;
  }
  if (key === 'ml' || key === 'mr') {
    if (object.sniptaleType === 'text') return controlsUtils.changeWidth;
    return (
      event: Parameters<typeof controlsUtils.scalingX>[0],
      transform: Parameters<typeof controlsUtils.scalingX>[1],
      x: number,
      y: number
    ) =>
      event.shiftKey
        ? scaleXProportionally(event, transform, x, y)
        : controlsUtils.scalingX(event, transform, x, y);
  }
  const scale = controlsUtils.scalingY;
  return (
    event: Parameters<typeof scale>[0],
    transform: Parameters<typeof scale>[1],
    x: number,
    y: number
  ) => {
    if (event.shiftKey) return scaleYProportionally(event, transform, x, y);
    return object.sniptaleType === 'shape' && event.ctrlKey
      ? controlsUtils.scalingYOrSkewingX(event, transform, x, y)
      : scale(event, transform, x, y);
  };
}

function createBoxControl(object: FabricObject, key: BoxControlKey, x: number, y: number) {
  return new Control({
    actionHandler: resolveBoxActionHandler(object, key),
    cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
    render: renderDrawingBoxHandle as Control['render'],
    sizeX: DRAWING_BOX_CONTROL_SIZE,
    sizeY: DRAWING_BOX_CONTROL_SIZE,
    x,
    y,
  });
}

export function createDrawingBoxControls(object: FabricObject): Record<string, Control> {
  const controls = Object.fromEntries(
    BOX_CONTROL_POSITIONS.map(([key, x, y]) => [key, createBoxControl(object, key, x, y)])
  );
  return { ...controls, mtr: createDrawingRotationControl() };
}

export function createDrawingTextControls(object: FabricObject): Record<string, Control> {
  return {
    ml: createBoxControl(object, 'ml', -0.5, 0),
    mr: createBoxControl(object, 'mr', 0.5, 0),
    mtr: createDrawingRotationControl(),
  };
}
