import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStoredArrowPointIndex: vi.fn(),
  readArrowAuthoredPoints: vi.fn(),
  readArrowPoints: vi.fn(),
  resolveArrowEditableControlState: vi.fn(),
  resolveArrowStoredPointFromControl: vi.fn(),
  toArrowGeometryPoint: vi.fn(),
  toParentPlanePoint: vi.fn(),
  toViewportPoint: vi.fn(),
}));

vi.mock('./controls-target', () => ({
  resolveArrowEditableControlState: mocks.resolveArrowEditableControlState,
}));

vi.mock('./controls-points', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls-points')>()),
  readArrowAuthoredPoints: mocks.readArrowAuthoredPoints,
  readArrowPoints: mocks.readArrowPoints,
}));

vi.mock('./controls-offsets/exposure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls-offsets/exposure')>()),
  getStoredArrowPointIndex: mocks.getStoredArrowPointIndex,
}));

vi.mock('./controls-offsets/reverse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls-offsets/reverse')>()),
  resolveArrowStoredPointFromControl: mocks.resolveArrowStoredPointFromControl,
}));

vi.mock('./controls.coordinates', () => ({
  toArrowGeometryPoint: mocks.toArrowGeometryPoint,
  toParentPlanePoint: mocks.toParentPlanePoint,
  toViewportPoint: mocks.toViewportPoint,
}));

import { createArrowPointControl } from './controls.point';

function createArrow() {
  return {
    left: 10,
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 20,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps endpoint controls larger than internal point controls', () => {
  const updateArrowObject = vi.fn();
  const start = createArrowPointControl(0, 3, 'start', updateArrowObject);
  const internal = createArrowPointControl(1, 3, 'point-1', updateArrowObject);

  expect(start.sizeX).toBeGreaterThan(internal.sizeX ?? 0);
  expect(start.sizeY).toBeGreaterThan(internal.sizeY ?? 0);
  expect(start.touchSizeX).toBe(26);
  expect(internal.touchSizeY).toBe(26);
});

it('falls back to viewport origin when the target is not an editable arrow', () => {
  const control = createArrowPointControl(0, 2, 'start', vi.fn());
  mocks.resolveArrowEditableControlState.mockReturnValue(null);

  expect(control.positionHandler?.({} as never, [] as never, {} as never, {} as never)).toEqual(
    new Point(0, 0)
  );
});

it('rejects drag actions for unowned targets', () => {
  const control = createArrowPointControl(0, 2, 'start', vi.fn());
  mocks.resolveArrowEditableControlState.mockReturnValue(null);

  expect(control.actionHandler?.({} as never, { target: {} } as never, 4, 5)).toBe(false);
});

it('updates the dragged point and preserves the opposite anchor position', () => {
  const arrow = createArrow();
  const settings = { mode: 'straight' };
  const storedPoints = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];
  const updateArrowObject = vi.fn();
  const control = createArrowPointControl(0, 2, 'start', updateArrowObject);

  mocks.resolveArrowEditableControlState.mockReturnValue({
    arrow,
    editablePoints: storedPoints,
    settings,
  });
  mocks.readArrowAuthoredPoints.mockReturnValue(storedPoints);
  mocks.readArrowPoints.mockReturnValueOnce(storedPoints).mockReturnValueOnce([
    { x: 5, y: 0 },
    { x: 12, y: 0 },
  ]);
  mocks.getStoredArrowPointIndex.mockReturnValue(0);
  mocks.toArrowGeometryPoint.mockReturnValue({ x: 5, y: 0 });
  mocks.resolveArrowStoredPointFromControl.mockReturnValue({ x: 5, y: 0 });
  mocks.toParentPlanePoint
    .mockReturnValueOnce(new Point(10, 0))
    .mockReturnValueOnce(new Point(12, 0));

  expect(control.actionHandler?.({} as never, { target: arrow } as never, 5, 0)).toBe(true);
  expect(updateArrowObject).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ],
    settings,
  });
  expect(arrow.left).toBe(8);
  expect(arrow.top).toBe(20);
  expect(arrow.setCoords).toHaveBeenCalledOnce();
  expect(arrow.set).toHaveBeenCalledWith('dirty', true);
});
