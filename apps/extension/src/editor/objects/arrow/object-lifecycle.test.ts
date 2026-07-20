import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorArrowSettings } from '../../../features/editor/document/types';

const mocks = vi.hoisted(() => ({
  applyArrowObjectStateMock: vi.fn(),
  buildArrowPointsFromOptionsMock: vi.fn(() => [
    { x: 1, y: 2 },
    { x: 9, y: 10 },
  ]),
  createArrowControlsMock: vi.fn(() => ({ controlSet: true })),
  createObjectLabelMock: vi.fn(() => 'Arrow 3'),
  pickArrowPointUpdateOptionsMock: vi.fn((options) => options),
  readArrowAuthoredPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 0 },
  ]),
  readArrowPointsMock: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 0 },
  ]),
  readArrowSettingsMock: vi.fn(),
  resolveArrowUpdatePointsMock: vi.fn(
    (previousPoints, _settings, options) => options.points ?? previousPoints
  ),
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

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  createObjectLabel: mocks.createObjectLabelMock,
}));

vi.mock('./geometry/options', () => ({
  buildArrowPointsFromOptions: mocks.buildArrowPointsFromOptionsMock,
}));

vi.mock('./controls', async () => ({
  ...(await vi.importActual<typeof import('./controls')>('./controls')),
  createArrowControls: mocks.createArrowControlsMock,
  readArrowGeometry: vi.fn(),
  readArrowPoints: mocks.readArrowPointsMock,
  readArrowSettings: mocks.readArrowSettingsMock,
  toArrowGeometryPoint: vi.fn(),
}));

vi.mock('./controls.helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls.helpers')>()),
  readArrowAuthoredPoints: mocks.readArrowAuthoredPointsMock,
}));

vi.mock('./state/apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state/apply')>()),
  applyArrowObjectState: mocks.applyArrowObjectStateMock,
}));
vi.mock('./state-points', () => ({
  pickArrowPointUpdateOptions: mocks.pickArrowPointUpdateOptionsMock,
  resolveArrowUpdatePoints: mocks.resolveArrowUpdatePointsMock,
}));

import { createArrowObject, isArrowObject, updateArrowObject } from './';

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

function setupLifecycleMocks() {
  vi.clearAllMocks();
  mocks.readArrowSettingsMock.mockReturnValue(createCurveSettings());
}

function assertUpdateArrowObjectLifecycle() {
  const arrow = createArrow();

  updateArrowObject(arrow, {
    points: [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
  } as never);

  expect(mocks.resolveArrowUpdatePointsMock).toHaveBeenCalledWith(
    [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ],
    createCurveSettings(),
    expect.objectContaining({
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    })
  );
  expect(mocks.applyArrowObjectStateMock).toHaveBeenCalledWith(
    arrow,
    createCurveSettings(),
    [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
    expect.any(Function)
  );
}

function assertCreateArrowObjectLifecycle() {
  const created = createArrowObject({
    id: 'arrow-1',
    labelIndex: 3,
    settings: createCurveSettings(),
    start: { x: 0, y: 0 },
    end: { x: 20, y: 10 },
  });
  const explicitlyLabeled = createArrowObject({
    id: 'arrow-2',
    label: 'Explicit label',
    labelIndex: 4,
    settings: createCurveSettings(),
  } as never);

  expect(isArrowObject(createArrow())).toBe(false);
  expect(isArrowObject(created)).toBe(true);
  expect(created.sniptaleLabel).toBe('Arrow 3');
  expect(explicitlyLabeled.sniptaleLabel).toBe('Explicit label');
  expect(mocks.buildArrowPointsFromOptionsMock).toHaveBeenCalledTimes(2);
  expect(mocks.pickArrowPointUpdateOptionsMock).toHaveBeenCalledTimes(2);
}

describe('object-factory arrow object update lifecycle', () => {
  beforeEach(setupLifecycleMocks);

  it(
    'updates arrows with stored settings fallback and control rebind callback',
    assertUpdateArrowObjectLifecycle
  );
});

describe('object-factory arrow object creation lifecycle', () => {
  beforeEach(setupLifecycleMocks);

  it(
    'creates labeled arrows and distinguishes arrow instances from plain objects',
    assertCreateArrowObjectLifecycle
  );
});
