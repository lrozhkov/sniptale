import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorArrowSettings } from '../../../features/editor/document/types';

const mocks = vi.hoisted(() => ({
  applyArrowObjectStateMock: vi.fn(),
  createArrowControlsMock: vi.fn(() => ({ controlSet: true })),
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
  toArrowGeometryPointMock: vi.fn((_arrow, point) => point),
}));

vi.mock('fabric', () => ({
  Path: class Path {},
}));

vi.mock('./geometry/distance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry/distance')>()),
  distanceSquared: mocks.distanceSquaredMock,
  distanceToSegmentSquared: mocks.distanceToSegmentSquaredMock,
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
  pickArrowPointUpdateOptions: vi.fn(),
  resolveArrowUpdatePoints: mocks.resolveArrowUpdatePointsMock,
}));

import { getArrowGeometry, getArrowSettings, insertArrowPoint, removeArrowPoint } from './';

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

function createArrow() {
  return {} as never;
}

function setupPointMocks() {
  vi.clearAllMocks();
  mocks.readArrowSettingsMock.mockReturnValue(createCurveSettings());
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 0 },
  ]);
}

function assertReadsGeometryAndSettings() {
  expect(getArrowGeometry(createArrow())).toEqual({
    control: { x: 5, y: 5 },
    end: { x: 10, y: 10 },
    start: { x: 0, y: 0 },
  });
  expect(getArrowSettings(createArrow())).toEqual(createCurveSettings());
}

function assertStraightInsertion() {
  mocks.readArrowSettingsMock.mockReturnValue({
    ...createCurveSettings(),
    mode: 'straight',
  });
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]);

  insertArrowPoint(createArrow(), { x: 4, y: 6 });

  expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    expect.objectContaining({ mode: 'curve' }),
    expect.objectContaining({
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 6 },
        { x: 10, y: 0 },
      ],
    })
  );
}

function assertCurveInsertion() {
  mocks.distanceToSegmentSquaredMock.mockImplementation((_point, start) => (start.x === 5 ? 1 : 9));

  insertArrowPoint(createArrow(), { x: 8, y: 3 });

  expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
    [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ],
    createCurveSettings(),
    expect.objectContaining({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 8, y: 3 },
        { x: 10, y: 0 },
      ],
    })
  );
}

function assertRemovalGuards() {
  mocks.readArrowSettingsMock.mockReturnValue({
    ...createCurveSettings(),
    mode: 'straight',
  });
  expect(removeArrowPoint(createArrow(), { x: 5, y: 0 })).toBe(false);

  mocks.readArrowSettingsMock.mockReturnValue(createCurveSettings());
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 4, y: 4 },
  ]);
  expect(removeArrowPoint(createArrow(), { x: 4, y: 4 })).toBe(false);
}

function assertNearestBendRemoval() {
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 4, y: 4 },
    { x: 8, y: 8 },
    { x: 12, y: 12 },
  ]);
  mocks.distanceSquaredMock
    .mockReturnValueOnce(9)
    .mockReturnValueOnce(16)
    .mockReturnValueOnce(4000)
    .mockReturnValueOnce(4000);

  expect(removeArrowPoint(createArrow(), { x: 5, y: 5 })).toBe(true);
  expect(removeArrowPoint(createArrow(), { x: 50, y: 50 })).toBe(false);
  expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenLastCalledWith(
    [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 8, y: 8 },
      { x: 12, y: 12 },
    ],
    createCurveSettings(),
    expect.objectContaining({
      points: [
        { x: 0, y: 0 },
        { x: 8, y: 8 },
        { x: 12, y: 12 },
      ],
    })
  );
}

describe('object-factory arrow point reads', () => {
  beforeEach(setupPointMocks);

  it('reads geometry and settings through control helpers', assertReadsGeometryAndSettings);
});

describe('object-factory arrow point insertion', () => {
  beforeEach(setupPointMocks);

  it('converts straight arrows into curves when inserting points', assertStraightInsertion);
  it('appends the new point to the nearest curve segment', assertCurveInsertion);
});

describe('object-factory arrow point removal', () => {
  beforeEach(setupPointMocks);

  it('guards removal by mode and point count', assertRemovalGuards);
  it('removes only the nearest internal bend within threshold', assertNearestBendRemoval);
});
