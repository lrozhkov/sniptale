import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorArrowSettings } from '../../../features/editor/document/types';

const mocks = vi.hoisted(() => ({
  applyArrowObjectStateMock: vi.fn(),
  buildArrowPointsFromOptionsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 20, y: 10 },
  ]),
  createArrowControlsMock: vi.fn(() => ({ controlSet: true })),
  createObjectLabelMock: vi.fn(() => 'Arrow 3'),
  distanceSquaredMock: vi.fn(() => 4),
  distanceToSegmentSquaredMock: vi.fn(),
  readArrowGeometryMock: vi.fn(() => ({
    control: { x: 5, y: 5 },
    end: { x: 10, y: 10 },
    start: { x: 0, y: 0 },
  })),
  readArrowPointsMock: vi.fn(),
  readArrowSettingsMock: vi.fn(),
  resolveArrowUpdatePointsMock: vi.fn(
    (previousPoints, _settings, options) => options.points ?? previousPoints
  ),
  pickArrowPointUpdateOptionsMock: vi.fn((options) => ({
    ...(options.points === undefined ? {} : { points: options.points }),
    ...(options.start === undefined ? {} : { start: options.start }),
    ...(options.end === undefined ? {} : { end: options.end }),
    ...(options.control === undefined ? {} : { control: options.control }),
  })),
  toArrowGeometryPointMock: vi.fn((_arrow, point) => point),
}));
vi.mock('fabric', () => ({
  Path: class Path {
    objectCaching = false;

    constructor(path: string, options: Record<string, unknown>) {
      Object.assign(this, { path }, options);
    }
  },
}));
vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  createObjectLabel: mocks.createObjectLabelMock,
}));
vi.mock('./geometry/distance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry/distance')>()),
  distanceSquared: mocks.distanceSquaredMock,
  distanceToSegmentSquared: mocks.distanceToSegmentSquaredMock,
}));
vi.mock('./geometry/options', () => ({
  buildArrowPointsFromOptions: mocks.buildArrowPointsFromOptionsMock,
}));
vi.mock('./controls', async () => ({
  ...(await vi.importActual<typeof import('./controls')>('./controls')),
  createArrowControls: mocks.createArrowControlsMock,
  readArrowGeometry: mocks.readArrowGeometryMock,
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
  pickArrowPointUpdateOptions: mocks.pickArrowPointUpdateOptionsMock,
  resolveArrowUpdatePoints: mocks.resolveArrowUpdatePointsMock,
}));
import { createArrowObject, getArrowGeometry, getArrowSettings, insertArrowPoint } from './';
import {
  isArrowObject,
  normalizeScaledArrowObject,
  removeArrowPoint,
  updateArrowPointOnDoubleClick,
  updateArrowObject,
} from './';
function createArrow() {
  return {
    sniptaleArrowEditMode: true,
    sniptaleType: 'arrow',
  } as never;
}

function createStraightSettings(): EditorArrowSettings {
  return {
    color: '#ff671d',
    endHead: 'triangle',
    mode: 'straight' as const,
    opacity: 1,
    shadow: 0,
    startHead: 'none' as const,
    variant: 'standard',
    width: 4,
  };
}
const STRAIGHT_POINTS = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
];
const CURVE_POINTS = [
  { x: 0, y: 0 },
  { x: 5, y: 5 },
  { x: 10, y: 0 },
];

function setupArrowMocks() {
  vi.clearAllMocks();
  mocks.readArrowPointsMock.mockReturnValue(STRAIGHT_POINTS);
  mocks.readArrowSettingsMock.mockReturnValue(createStraightSettings());
  mocks.distanceToSegmentSquaredMock.mockImplementation((_point, _start, _end) => 1);
}

function triggerArrowControlsUpdate(target: unknown, options: unknown) {
  const firstControlsCall = mocks.createArrowControlsMock.mock.calls.at(0) as unknown[] | undefined;
  const updateFromControls = firstControlsCall?.[1] as
    | ((nextTarget: unknown, nextOptions: unknown) => void)
    | undefined;
  updateFromControls?.(target, options);
}

function runReadGeometrySuite() {
  it('reads geometry and settings through the arrow control adapters', () => {
    const arrow = createArrow();

    expect(getArrowGeometry(arrow)).toEqual({
      control: { x: 5, y: 5 },
      end: { x: 10, y: 10 },
      start: { x: 0, y: 0 },
    });
    expect(getArrowSettings(arrow)).toEqual(createStraightSettings());
  });
}

function runInsertArrowPointSuite() {
  it('inserts points by switching straight arrows to curves and by choosing the nearest segment', () => {
    insertArrowPoint(createArrow(), { x: 4, y: 6 });

    expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenCalledWith(
      STRAIGHT_POINTS,
      expect.objectContaining({ mode: 'curve' }),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 10, y: 0 },
        ],
        settings: expect.objectContaining({ mode: 'curve' }),
      })
    );

    mocks.readArrowSettingsMock.mockReturnValue({
      ...createStraightSettings(),
      mode: 'curve',
    });
    mocks.readArrowPointsMock.mockReturnValue(CURVE_POINTS);
    mocks.distanceToSegmentSquaredMock.mockImplementation((_point, start) =>
      start.x === 0 ? 10 : 1
    );

    insertArrowPoint(createArrow(), { x: 8, y: 3 });

    expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
      CURVE_POINTS,
      expect.objectContaining({ mode: 'curve' }),
      expect.objectContaining({
        points: [...CURVE_POINTS.slice(0, 2), { x: 8, y: 3 }, CURVE_POINTS[2]],
      })
    );
  });
}

function runRemoveArrowPointSuite() {
  it('removes arrow points only for curve arrows when a control point is close enough', () => {
    expect(removeArrowPoint(createArrow(), { x: 4, y: 6 })).toBe(false);

    mocks.readArrowSettingsMock.mockReturnValue({
      ...createStraightSettings(),
      mode: 'curve',
    });
    mocks.readArrowPointsMock.mockReturnValue(CURVE_POINTS);

    expect(removeArrowPoint(createArrow(), { x: 5, y: 5 })).toBe(true);
    expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
      CURVE_POINTS,
      expect.objectContaining({ mode: 'straight' }),
      expect.objectContaining({
        points: STRAIGHT_POINTS,
        settings: expect.objectContaining({ mode: 'straight' }),
      })
    );

    mocks.distanceSquaredMock.mockReturnValueOnce(5000);
    expect(removeArrowPoint(createArrow(), { x: 50, y: 50 })).toBe(false);

    mocks.readArrowPointsMock.mockReturnValueOnce(STRAIGHT_POINTS);
    expect(removeArrowPoint(createArrow(), { x: 10, y: 0 })).toBe(false);
  });
}

function registerArrowStateUpdateTest() {
  it('updates arrow state through the arrow controls callback', () => {
    const arrow = createArrow();
    expect(isArrowObject(arrow)).toBe(false);

    updateArrowObject(arrow, {
      points: STRAIGHT_POINTS,
      settings: createStraightSettings(),
    });

    expect(mocks.applyArrowObjectStateMock).toHaveBeenCalledWith(
      arrow,
      createStraightSettings(),
      STRAIGHT_POINTS,
      expect.any(Function)
    );
    const createControls = mocks.applyArrowObjectStateMock.mock.calls[0]?.[3] as
      | (() => Record<string, unknown>)
      | undefined;
    expect(createControls?.()).toEqual({ controlSet: true });
    triggerArrowControlsUpdate(arrow, {
      points: [
        { x: 1, y: 1 },
        { x: 9, y: 1 },
      ],
      settings: createStraightSettings(),
    });
    expect(mocks.applyArrowObjectStateMock).toHaveBeenCalledTimes(2);
  });
}

function registerArrowCreationMetadataTest() {
  it('creates arrow objects with generated and explicit metadata', () => {
    const created = createArrowObject({
      id: 'arrow-1',
      labelIndex: 3,
      settings: createStraightSettings(),
      start: { x: 0, y: 0 },
      end: { x: 20, y: 10 },
    });

    expect(created.sniptaleId).toBe('arrow-1');
    expect(created.sniptaleLabel).toBe('Arrow 3');
    expect(created.sniptaleRole).toBe('annotation');
    expect(created.sniptaleType).toBe('arrow');
    expect(isArrowObject(created)).toBe(true);
    expect(mocks.buildArrowPointsFromOptionsMock).toHaveBeenCalled();

    const explicitlyLabeled = createArrowObject({
      id: 'arrow-2',
      label: 'Explicit label',
      labelIndex: 4,
      settings: createStraightSettings(),
    } as never);

    expect(explicitlyLabeled.sniptaleLabel).toBe('Explicit label');
  });
}

function runTaperedBehaviorSuite() {
  it('keeps arrows in the shared curve workflow and neutralizes their scaling path', () => {
    const arrow = { sniptaleType: 'arrow', scaleX: 2, scaleY: 2, set: vi.fn() };
    const taperedSettings = { ...createStraightSettings(), variant: 'tapered' as const };
    mocks.readArrowSettingsMock.mockReturnValue(taperedSettings);
    mocks.readArrowPointsMock.mockReturnValue(STRAIGHT_POINTS);

    expect(normalizeScaledArrowObject(arrow as never)).toBe(true);
    expect(arrow.set).toHaveBeenCalledWith({ scaleX: 1, scaleY: 1 });

    updateArrowPointOnDoubleClick(createArrow(), { x: 4, y: 6 });
    expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenCalledWith(
      STRAIGHT_POINTS,
      expect.objectContaining({ mode: 'curve', variant: 'tapered' }),
      expect.objectContaining({
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 6 },
          { x: 10, y: 0 },
        ],
        settings: expect.objectContaining({ mode: 'curve', variant: 'tapered' }),
      })
    );
  });
}

describe('object-factory-arrow', () => {
  beforeEach(setupArrowMocks);
  runReadGeometrySuite();
  runInsertArrowPointSuite();
  runRemoveArrowPointSuite();
  registerArrowStateUpdateTest();
  registerArrowCreationMetadataTest();
  runTaperedBehaviorSuite();
});
