/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';
const fabricMock = vi.hoisted(() => {
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
  class Control {
    actionHandler?: (...args: any[]) => boolean;
    positionHandler?: (...args: any[]) => Point;
    constructor(config: any) {
      Object.assign(this, config);
    }
  }
  class Path {
    controls: Record<string, unknown> = {};
    left = 10;
    sniptaleArrowEditMode = true;
    sniptaleType = 'arrow';
    pathOffset = new Point(5, 5);
    top = 12;
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
    set(values: Record<string, unknown> | string, value?: unknown) {
      if (typeof values === 'string') {
        (this as any)[values] = value;
        return;
      }
      Object.assign(this, values);
    }
    setCoords = vi.fn();
    setDimensions = vi.fn();
  }
  return {
    Control,
    Path,
    Point,
    util: {
      multiplyTransformMatrices: vi.fn(() => ({})),
      sendPointToPlane: vi.fn((point: Point) => point),
    },
  };
});
vi.mock('fabric', () => fabricMock);
const mocks = vi.hoisted(() => ({
  buildArrowPathDataMock: vi.fn(() => 'M 0 0 L 10 10'),
  buildPointsFromOptionsMock: vi.fn(() => [
    { x: 1, y: 2 },
    { x: 9, y: 10 },
  ]),
  clonePointMock: vi.fn((point: { x: number; y: number }) => ({ ...point })),
  createControlsMock: vi.fn(() => ({ control: new fabricMock.Control({}) })),
  getArrowControlKeyMock: vi.fn((index) => `control-${index}`),
  getArrowEndpointIndexMock: vi.fn((index, count) =>
    index === 0 || index === count - 1 ? index : null
  ),
  getEditableArrowPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 10 },
  ]),
  getStoredArrowPointIndexMock: vi.fn((_settings, _points, displayIndex) => displayIndex),
  isPointLikeMock: vi.fn(() => true),
  normalizeArrowPointsMock: vi.fn((points: Array<{ x: number; y: number }>) => points),
  readArrowPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 10 },
  ]),
  readArrowSettingsMock: vi.fn(() => ({
    color: '#123456',
    endHead: 'triangle',
    mode: 'curve',
    opacity: 0.6,
    startHead: 'none',
    variant: 'standard',
    width: 4,
  })),
  resolveArrowStoredPointFromControlMock: vi.fn(
    (_settings, _points, _displayIndex, point) => point
  ),
  serializeArrowPointsMock: vi.fn(() => '[points]'),
}));
vi.mock('./geometry/options', async () => ({
  ...(await vi.importActual<typeof import('./geometry/options')>('./geometry/options')),
  buildArrowPointsFromOptions: mocks.buildPointsFromOptionsMock,
}));
vi.mock('./geometry/points', async () => ({
  ...(await vi.importActual<typeof import('./geometry/points')>('./geometry/points')),
  clonePoint: mocks.clonePointMock,
  isPointLike: mocks.isPointLikeMock,
}));
vi.mock('./geometry/normalization', async () => ({
  ...(await vi.importActual<typeof import('./geometry/normalization')>('./geometry/normalization')),
  normalizeArrowPoints: mocks.normalizeArrowPointsMock,
}));
vi.mock('./geometry/serialization', async () => ({
  ...(await vi.importActual<typeof import('./geometry/serialization')>('./geometry/serialization')),
  serializeArrowPoints: mocks.serializeArrowPointsMock,
}));
vi.mock('./paths', () => ({ buildArrowPathData: mocks.buildArrowPathDataMock }));
vi.mock('./controls.helpers', () => ({
  getArrowControlKey: mocks.getArrowControlKeyMock,
  getArrowEndpointIndex: mocks.getArrowEndpointIndexMock,
  getEditableArrowPoints: mocks.getEditableArrowPointsMock,
  getStoredArrowPointIndex: mocks.getStoredArrowPointIndexMock,
  readArrowAuthoredPoints: mocks.readArrowPointsMock,
  readArrowPoints: mocks.readArrowPointsMock,
  readArrowSettings: mocks.readArrowSettingsMock,
  resolveArrowStoredPointFromControl: mocks.resolveArrowStoredPointFromControlMock,
}));
vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  hexToRgba: (color: string) => `${color}-rgba`,
}));
import { createArrowControls, toArrowGeometryPoint } from './controls';
import { applyArrowObjectState } from './state/apply';
import { resolveArrowUpdatePoints } from './state-points';
function expectControl(
  controls: Record<string, unknown>,
  key: string
): {
  actionHandler?: (...args: unknown[]) => boolean;
  positionHandler?: (...args: unknown[]) => unknown;
} {
  const control = controls[key];
  if (!control) {
    throw new Error(`Expected ${key} control`);
  }

  return control as {
    actionHandler?: (...args: unknown[]) => boolean;
    positionHandler?: (...args: unknown[]) => unknown;
  };
}

describe('arrow controls and state', () => {
  it('creates arrow controls and moves editable points through handlers', () => {
    const arrow = new fabricMock.Path([
      ['M', 0, 0],
      ['Q', 5, 5, 10, 10],
    ]) as any;
    const updateArrowObject = vi.fn();
    const controls = createArrowControls(arrow, updateArrowObject);
    const control = expectControl(controls, 'control-0');

    expect(Object.keys(controls).join(',')).toBe('control-0,control-1,control-2,insert-0,insert-1');
    expect((control.positionHandler as any)?.(null, null, arrow, {} as any)).toEqual(
      new fabricMock.Point(-5, -5)
    );
    expect(control.actionHandler?.({} as never, { target: arrow } as any, 20, 24)).toBe(true);
    expect(updateArrowObject).toHaveBeenCalled();
    expect(arrow.setCoords).toHaveBeenCalled();
    expect(toArrowGeometryPoint(arrow, { x: 15, y: 18 })).toEqual({ x: 20, y: 23 });
  });

  it('returns fallback positions and rejects unsupported control targets', () => {
    const arrow = new fabricMock.Path([
      ['M', 0, 0],
      ['L', 10, 10],
    ]) as any;
    const updateArrowObject = vi.fn();
    const controls = createArrowControls(arrow, updateArrowObject);
    const control = expectControl(controls, 'control-0');

    expect((control.positionHandler as any)?.(null, null, {} as never, {} as any)).toEqual(
      new fabricMock.Point(0, 0)
    );
    expect(
      control.actionHandler?.({} as never, { target: { sniptaleType: 'shape' } } as any, 2, 4)
    ).toBe(false);
    expect(updateArrowObject).not.toHaveBeenCalled();
  });

  it('keeps endpoint controls available for block-arrow variants', () => {
    const arrow = new fabricMock.Path([
      ['M', 0, 0],
      ['L', 10, 10],
    ]) as any;
    const updateArrowObject = vi.fn();
    mocks.readArrowSettingsMock.mockReturnValueOnce({
      color: '#123456',
      endHead: 'triangle',
      mode: 'curve',
      opacity: 0.6,
      startHead: 'none',
      variant: 'tapered',
      width: 4,
    });
    mocks.getEditableArrowPointsMock.mockReturnValueOnce([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);

    expect(Object.keys(createArrowControls(arrow, updateArrowObject)).join(',')).toBe(
      'control-0,control-1,insert-0'
    );
  });

  it('resolves arrow update points and applies state to arrow objects', () => {
    const points = resolveArrowUpdatePoints(
      [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ],
      {
        color: '#123456',
        arrowType: 'curved',
        dynamicWidth: false,
        endHead: 'triangle',
        mode: 'curve',
        opacity: 0.6,
        startHead: 'none',
        variant: 'standard',
        width: 4,
      } as never,
      { control: { x: 6, y: 7 }, end: { x: 10, y: 11 }, start: { x: 1, y: 2 } }
    );
    expect(points[0]).toEqual({ x: 1, y: 2 });
    expect(points[points.length - 1]).toEqual({ x: 10, y: 11 });
    expect(
      resolveArrowUpdatePoints([], { arrowType: 'sharp', mode: 'straight' } as never, {})
    ).toEqual([
      { x: 1, y: 2 },
      { x: 9, y: 10 },
    ]);

    const arrow = new fabricMock.Path([
      ['M', 0, 0],
      ['L', 0, 0],
    ]) as any;
    applyArrowObjectState(
      arrow,
      {
        color: '#123456',
        arrowType: 'curved',
        dynamicWidth: false,
        endHead: 'triangle',
        mode: 'curve',
        opacity: 0.6,
        startHead: 'none',
        variant: 'standard',
        width: 4,
      } as never,
      [
        { x: 1, y: 2 },
        { x: 6, y: 7 },
        { x: 10, y: 11 },
      ],
      (() => mocks.createControlsMock() as any) as any
    );

    expect(mocks.buildArrowPathDataMock).toHaveBeenCalled();
    expect(arrow.sniptaleArrowType).toBe('curved');
    expect(arrow.sniptaleArrowDynamicWidth).toBe(false);
    expect(arrow.sniptaleArrowMode).toBe('curve');
    expect(arrow.sniptaleArrowPointsJson).toBe('[points]');
    expect(arrow.controls).toEqual({ control: expect.any(fabricMock.Control) });
    expect(arrow.setDimensions).toHaveBeenCalled();
    expect(arrow.setCoords).toHaveBeenCalled();

    const legacyArrow = new fabricMock.Path([]) as any;
    applyArrowObjectState(
      legacyArrow,
      { color: '#123456', mode: 'straight', opacity: 0.6, variant: 'tapered', width: 4 } as never,
      [
        { x: 1, y: 2 },
        { x: 10, y: 11 },
      ],
      () => ({})
    );
    expect(legacyArrow.sniptaleArrowDynamicWidth).toBe(true);
    expect(legacyArrow.sniptaleArrowType).toBe('sharp');
  });
});
