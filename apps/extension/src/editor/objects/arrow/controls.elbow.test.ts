import { beforeEach, expect, it, vi } from 'vitest';

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
    actionHandler?: (...args: any[]) => boolean;
    positionHandler?: (...args: any[]) => unknown;
    constructor(config: any) {
      Object.assign(this, config);
    }
  }
  return Control;
});

const FabricPath = vi.hoisted(() => {
  class Path {
    sniptaleArrowMode = 'straight';
    sniptaleArrowType = 'elbow';
    sniptaleType = 'arrow';
    pathOffset = new FabricPoint(5, 5);
    constructor(public path: any[]) {}
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
    { x: 100, y: 40 },
  ]),
  getStoredArrowPointIndexMock: vi.fn((_settings, _points, displayIndex) => displayIndex),
  readArrowAuthoredPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 100, y: 40 },
  ]),
  readArrowPointsMock: vi.fn(),
  resolveArrowStoredPointFromControlMock: vi.fn(
    (_settings, _points, _displayIndex, point) => point
  ),
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

vi.mock('./controls-offsets/keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls-offsets/keys')>()),
  getArrowEndpointIndex: mocks.getArrowEndpointIndexMock,
}));

vi.mock('./controls-offsets/exposure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls-offsets/exposure')>()),
  getStoredArrowPointIndex: mocks.getStoredArrowPointIndexMock,
}));

vi.mock('./controls-offsets/reverse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls-offsets/reverse')>()),
  resolveArrowStoredPointFromControl: mocks.resolveArrowStoredPointFromControlMock,
}));

vi.mock('./controls-points', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls-points')>()),
  readArrowAuthoredPoints: mocks.readArrowAuthoredPointsMock,
  readArrowPoints: mocks.readArrowPointsMock,
}));

import { createArrowControls } from './controls';

function getControl(controls: Record<string, unknown>, key: string) {
  const control = controls[key];
  if (!control) {
    throw new Error(`Expected ${key} control`);
  }
  return control as {
    actionHandler?: (...args: unknown[]) => boolean;
    positionHandler?: (...args: unknown[]) => unknown;
  };
}

function createElbowRoutePoints() {
  return [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
  ];
}

function createEditableElbowArrow() {
  const arrow = new fabricMock.Path([
    ['M', 0, 0],
    ['L', 50, 0],
    ['L', 50, 40],
    ['L', 100, 40],
  ]) as any;
  arrow.sniptaleArrowEditMode = true;
  return arrow;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('uses object resize controls until point-edit mode is enabled', () => {
  const arrow = new fabricMock.Path([['M', 0, 0]]) as any;

  const controls = createArrowControls(arrow, vi.fn());

  expect(controls).toEqual({ tl: { defaultControl: true } });
  expect(mocks.getEditableArrowPointsMock).not.toHaveBeenCalled();
});

it('keeps endpoint controls functional while elbow segment handles are present', () => {
  const routePoints = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
  ];
  const arrow = new fabricMock.Path([
    ['M', 0, 0],
    ['L', 50, 0],
    ['L', 50, 40],
    ['L', 100, 40],
  ]) as any;
  arrow.sniptaleArrowEditMode = true;
  const updateArrowObject = vi.fn();
  mocks.readArrowPointsMock
    .mockReturnValueOnce(routePoints)
    .mockReturnValueOnce(routePoints)
    .mockReturnValueOnce(routePoints);

  const controls = createArrowControls(arrow, updateArrowObject);
  const startControl = getControl(controls, 'control-0');

  expect((startControl.positionHandler as any)?.(null, null, {} as never, {} as any)).toEqual(
    new fabricMock.Point(0, 0)
  );
  expect((startControl.positionHandler as any)?.(null, null, arrow, {} as any)).toEqual(
    new fabricMock.Point(-5, -5)
  );
  expect(
    startControl.actionHandler?.({} as never, { target: { sniptaleType: 'shape' } } as any, 2, 4)
  ).toBe(false);
  expect(startControl.actionHandler?.({} as never, { target: arrow } as any, 30, 35)).toBe(true);
  expect(updateArrowObject).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 35, y: 40 },
      { x: 100, y: 40 },
    ],
    settings: expect.objectContaining({ arrowType: 'elbow' }),
  });
  expect(arrow.setCoords).toHaveBeenCalled();
  expect(arrow.set).toHaveBeenCalledWith('dirty', true);
});

it('creates elbow segment controls and moves the selected route segment', () => {
  const routePoints = createElbowRoutePoints();
  const arrow = createEditableElbowArrow();
  const updateArrowObject = vi.fn();
  mocks.readArrowPointsMock
    .mockReturnValueOnce(routePoints)
    .mockReturnValueOnce(routePoints)
    .mockReturnValueOnce([
      { x: 0, y: 0 },
      { x: 100, y: 40 },
    ])
    .mockReturnValueOnce(routePoints);

  const controls = createArrowControls(arrow, updateArrowObject);
  const segmentControl = getControl(controls, 'segment-2');

  expect(Object.keys(controls)).toEqual(['control-0', 'control-1', 'segment-2']);
  expect((segmentControl.positionHandler as any)?.(null, null, {} as never, {} as any)).toEqual(
    new fabricMock.Point(0, 0)
  );
  expect((segmentControl.positionHandler as any)?.(null, null, arrow, {} as any)).toEqual(
    new fabricMock.Point(45, 15)
  );
  expect((segmentControl.positionHandler as any)?.(null, null, arrow, {} as any)).toEqual(
    new fabricMock.Point(0, 0)
  );
  expect(
    segmentControl.actionHandler?.({} as never, { target: { sniptaleType: 'shape' } } as any, 2, 4)
  ).toBe(false);
  expect(segmentControl.actionHandler?.({} as never, { target: arrow } as any, 60, 30)).toBe(true);
  expect(updateArrowObject).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 0, y: 0 },
      { x: 65, y: 0 },
      { x: 65, y: 40 },
      { x: 100, y: 40 },
    ],
    settings: expect.objectContaining({ arrowType: 'elbow' }),
  });
});

it('rejects point moves when stored point anchors cannot be resolved', () => {
  const arrow = new fabricMock.Path([
    ['M', 0, 0],
    ['L', 100, 40],
  ]) as any;
  arrow.sniptaleArrowEditMode = true;
  const updateArrowObject = vi.fn();
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 100, y: 40 },
  ]);
  mocks.getStoredArrowPointIndexMock.mockReturnValueOnce(-1);
  let controls = createArrowControls(arrow, updateArrowObject);
  expect(
    getControl(controls, 'control-0').actionHandler?.({} as never, { target: arrow } as any, 2, 4)
  ).toBe(false);

  mocks.getStoredArrowPointIndexMock.mockReturnValueOnce(0);
  mocks.readArrowAuthoredPointsMock.mockReturnValueOnce([undefined as never]);
  controls = createArrowControls(arrow, updateArrowObject);
  expect(
    getControl(controls, 'control-0').actionHandler?.({} as never, { target: arrow } as any, 2, 4)
  ).toBe(false);
});
