import { expect, it, vi } from 'vitest';

const FabricPoint = vi.hoisted(() => {
  class Point {
    constructor(
      public x: number,
      public y: number
    ) {}
    add(point: Point) {
      return new Point(this.x + point.x, this.y + point.y);
    }
    subtract(point: Point) {
      return new Point(this.x - point.x, this.y - point.y);
    }
    transform() {
      return this;
    }
  }
  return Point;
});

const FabricControl = vi.hoisted(() => {
  class Control {
    actionHandler?: (...args: unknown[]) => boolean;
    cursorStyleHandler?: (...args: unknown[]) => string;
    positionHandler?: (...args: unknown[]) => unknown;
    render?: (...args: unknown[]) => void;
    sizeX?: number;
    sizeY?: number;
    touchSizeX?: number;
    constructor(config: Partial<Control>) {
      Object.assign(this, config);
    }
  }
  return Control;
});

const FabricPath = vi.hoisted(() => {
  class Path {
    sniptaleArrowMode = 'straight';
    sniptaleArrowType = 'sharp';
    sniptaleType = 'arrow';
    pathOffset = new FabricPoint(5, 5);
    constructor(public path: unknown[]) {}
    calcOwnMatrix() {
      return {};
    }
    calcTransformMatrix() {
      return {};
    }
    getViewportTransform() {
      return {};
    }
    set = vi.fn();
    setCoords = vi.fn();
  }
  return Path;
});

const fabricMock = vi.hoisted(() => {
  return {
    Control: FabricControl,
    controlsUtils: { createObjectDefaultControls: vi.fn(() => ({ tl: { defaultControl: true } })) },
    Path: FabricPath,
    Point: FabricPoint,
    util: {
      multiplyTransformMatrices: vi.fn(() => ({})),
      sendPointToPlane: vi.fn((point: unknown) => point),
    },
  };
});

vi.mock('fabric', () => fabricMock);

const mocks = vi.hoisted(() => ({
  getArrowControlKeyMock: vi.fn((index) => `control-${index}`),
  getArrowEndpointIndexMock: vi.fn((index, count) =>
    index === 0 || index === count - 1 ? index : null
  ),
  getEditableArrowPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]),
  getStoredArrowPointIndexMock: vi.fn((_settings, _points, displayIndex) => displayIndex),
  readArrowAuthoredPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]),
  readArrowPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]),
  resolveArrowStoredPointFromControlMock: vi.fn(),
}));

vi.mock('./controls.helpers', () => ({
  getArrowControlKey: mocks.getArrowControlKeyMock,
  getArrowEndpointIndex: mocks.getArrowEndpointIndexMock,
  getEditableArrowPoints: mocks.getEditableArrowPointsMock,
  getStoredArrowPointIndex: mocks.getStoredArrowPointIndexMock,
  readArrowAuthoredPoints: mocks.readArrowAuthoredPointsMock,
  readArrowPoints: mocks.readArrowPointsMock,
  resolveArrowStoredPointFromControl: mocks.resolveArrowStoredPointFromControlMock,
}));

import { createArrowControls } from './controls';

function readControl(controls: Record<string, unknown>, key: string) {
  const control = controls[key];
  if (!control) {
    throw new Error(`Expected ${key} control`);
  }
  return control as {
    actionHandler?: (...args: unknown[]) => boolean;
    cursorStyleHandler?: (...args: unknown[]) => string;
    positionHandler?: (...args: unknown[]) => unknown;
    sizeX?: number;
    touchSizeX?: number;
  };
}

it('shows larger draggable point controls and a separate potential-point handle', () => {
  const arrow = new fabricMock.Path([['M', 0, 0]]) as never;
  const updateArrowObject = vi.fn();
  (arrow as { sniptaleArrowEditMode?: boolean }).sniptaleArrowEditMode = true;

  const controls = createArrowControls(arrow, updateArrowObject);
  const startControl = readControl(controls, 'control-0');
  const insertControl = readControl(controls, 'insert-0');

  expect(Object.keys(controls)).toEqual(['control-0', 'control-1', 'insert-0']);
  expect(startControl.sizeX).toBe(20);
  expect(startControl.touchSizeX).toBe(26);
  expect(insertControl.positionHandler?.(null, null, arrow, {})).toEqual(
    new fabricMock.Point(45, -5)
  );
  expect(insertControl.cursorStyleHandler?.({} as never, {} as never, arrow, {})).toBe('copy');
});

it('turns a dragged potential-point handle into an authored arrow point', () => {
  const arrow = new fabricMock.Path([['M', 0, 0]]) as never;
  const updateArrowObject = vi.fn();
  (arrow as { sniptaleArrowEditMode?: boolean }).sniptaleArrowEditMode = true;

  const controls = createArrowControls(arrow, updateArrowObject);
  const insertControl = readControl(controls, 'insert-0');
  const transform = { target: arrow };

  expect(insertControl.actionHandler?.({} as never, transform, 50, 10)).toBe(true);
  expect(updateArrowObject).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 0, y: 0 },
      { x: 55, y: 15 },
      { x: 100, y: 0 },
    ],
    settings: expect.objectContaining({ arrowType: 'sharp' }),
  });
});
