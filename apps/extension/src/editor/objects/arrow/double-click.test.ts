import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorArrowSettings } from '../../../features/editor/document/types';

const mocks = vi.hoisted(() => ({
  applyArrowObjectStateMock: vi.fn(),
  createArrowControlsMock: vi.fn(() => ({ controlSet: true })),
  distanceSquaredMock: vi.fn(() => 4),
  distanceToSegmentSquaredMock: vi.fn(),
  readArrowPointsMock: vi.fn(),
  readArrowSettingsMock: vi.fn(),
  resolveArrowUpdatePointsMock: vi.fn(
    (previousPoints, _settings, options) => options.points ?? previousPoints
  ),
  toArrowGeometryPointMock: vi.fn((_arrow, point) => point),
}));

vi.mock('fabric', () => ({
  Path: class Path {
    objectCaching = false;

    constructor(
      public path: string,
      options: Record<string, unknown> = {}
    ) {
      Object.assign(this, options);
    }
  },
}));

vi.mock('./geometry/distance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry/distance')>()),
  distanceSquared: mocks.distanceSquaredMock,
  distanceToSegmentSquared: mocks.distanceToSegmentSquaredMock,
}));

vi.mock('./controls', async () => ({
  ...(await vi.importActual<typeof import('./controls')>('./controls')),
  createArrowControls: mocks.createArrowControlsMock,
  readArrowGeometry: vi.fn(),
  readArrowPoints: mocks.readArrowPointsMock,
  readArrowSettings: mocks.readArrowSettingsMock,
  toArrowGeometryPoint: mocks.toArrowGeometryPointMock,
}));

vi.mock('./controls.helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls.helpers')>()),
  readArrowAuthoredPoints: mocks.readArrowPointsMock,
}));

vi.mock('./state/apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state/apply')>()),
  applyArrowObjectState: mocks.applyArrowObjectStateMock,
}));
vi.mock('./state-points', () => ({
  pickArrowPointUpdateOptions: vi.fn(),
  resolveArrowUpdatePoints: mocks.resolveArrowUpdatePointsMock,
}));

import { updateArrowPointOnDoubleClick } from './';

function createCurveSettings(): EditorArrowSettings {
  return {
    color: '#ff671d',
    endHead: 'triangle',
    mode: 'curve',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 4,
  };
}

function createArrow(editMode = true) {
  return { sniptaleArrowEditMode: editMode } as never;
}

function setupCurveArrowMocks() {
  vi.clearAllMocks();
  mocks.readArrowSettingsMock.mockReturnValue(createCurveSettings());
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 0 },
  ]);
}

function expectInsertedCurvePoint(point: { x: number; y: number }) {
  expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
    [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ],
    expect.objectContaining({ mode: 'curve' }),
    expect.objectContaining({
      points: [{ x: 0, y: 0 }, point, { x: 5, y: 5 }, { x: 10, y: 0 }],
    })
  );
}

function expectRemovedCurvePoint() {
  expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
    [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ],
    expect.objectContaining({ mode: 'straight' }),
    expect.objectContaining({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    })
  );
}

function registerCurveEditingTest() {
  it('enters point-edit mode before mutating arrow points', () => {
    const arrow = createArrow(false);

    updateArrowPointOnDoubleClick(arrow, { x: 4, y: 6 });

    expect(arrow).toMatchObject({ sniptaleArrowEditMode: true });
    expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 0 },
      ],
      expect.objectContaining({ mode: 'curve' }),
      expect.not.objectContaining({ points: expect.any(Array) })
    );
  });

  it('inserts segment hits and removes direct internal bend hits on curve arrows', () => {
    mocks.distanceSquaredMock.mockReturnValueOnce(100);
    mocks.distanceToSegmentSquaredMock.mockImplementation((_point, start) =>
      start.x === 0 ? 1 : 9
    );

    updateArrowPointOnDoubleClick(createArrow(), { x: 4, y: 6 });
    expectInsertedCurvePoint({ x: 4, y: 6 });

    mocks.distanceSquaredMock.mockReturnValueOnce(4);
    updateArrowPointOnDoubleClick(createArrow(), { x: 5, y: 5 });
    expectRemovedCurvePoint();
  });
}

function registerStraightInsertTest() {
  it('treats straight arrows as insert-only double-click targets', () => {
    mocks.readArrowSettingsMock.mockReturnValue({
      ...createCurveSettings(),
      mode: 'straight',
      width: 10,
    });
    mocks.readArrowPointsMock.mockReturnValue([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);

    updateArrowPointOnDoubleClick(createArrow(), { x: 2, y: 3 });

    expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      expect.objectContaining({ mode: 'curve' }),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 3 },
          { x: 10, y: 0 },
        ],
      })
    );
  });
}

function registerTaperedWorkflowTest() {
  it('keeps tapered arrows in the same double-click point-edit workflow', () => {
    mocks.readArrowSettingsMock.mockReturnValue({
      ...createCurveSettings(),
      variant: 'tapered',
    });
    mocks.distanceSquaredMock.mockReturnValueOnce(100);
    mocks.distanceToSegmentSquaredMock.mockImplementation((_point, start) =>
      start.x === 0 ? 1 : 9
    );

    updateArrowPointOnDoubleClick(createArrow(), { x: 2, y: 3 });

    expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenCalledWith(
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 0 },
      ],
      expect.objectContaining({ mode: 'curve', variant: 'tapered' }),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 3 },
          { x: 5, y: 5 },
          { x: 10, y: 0 },
        ],
      })
    );
  });
}

function runDoubleClickSuite() {
  beforeEach(setupCurveArrowMocks);
  registerCurveEditingTest();
  registerStraightInsertTest();
  registerTaperedWorkflowTest();
}

describe('object-factory arrow double click', runDoubleClickSuite);
