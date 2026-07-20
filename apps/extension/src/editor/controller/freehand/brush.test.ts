import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadowMock: vi.fn<() => { blur: number } | null>(() => ({ blur: 6 })),
  finalizeAndAddPathMock: vi.fn(),
  hexToRgbaMock: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
}));

vi.mock('fabric', async () => await import('./fabric-brush.test-support'));
vi.mock('../../objects/shadow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shadow')>('../../objects/shadow')),
  createFabricShadow: mocks.createFabricShadowMock,
}));
vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    hexToRgba: mocks.hexToRgbaMock,
  };
});

import {
  EditorFreehandBrush,
  configureLiveFreehandBrush,
  consumeCommittedFreehandPoints,
  consumeCommittedFreehandStrokeSamples,
  getBrushDecimate,
} from './brush';
import { Point } from 'fabric';
import { setFabricBrushMockHooks } from './fabric-brush.test-support';

const canvas = { getZoom: () => 1 };

beforeEach(() => {
  vi.clearAllMocks();
  setFabricBrushMockHooks({ finalizeAndAddPath: mocks.finalizeAndAddPathMock });
});

function registerFinalizePathTest() {
  it('captures committed points before Fabric finalizes the path', () => {
    const brush = new EditorFreehandBrush(canvas as never);

    (brush as EditorFreehandBrush & { _points: Point[] })._points = [
      new Point(1, 2),
      new Point(3, 4),
    ];
    brush._finalizeAndAddPath();

    expect(mocks.finalizeAndAddPathMock).toHaveBeenCalledOnce();
    expect(brush.consumeCommittedPoints()).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(brush.consumeCommittedStrokeSamples()).toEqual([
      { t: 0, x: 1, y: 2 },
      { t: 0, x: 3, y: 4 },
    ]);
  });
}

it('configures a live freehand brush', () => {
  const brush = new EditorFreehandBrush(canvas as never);

  mocks.createFabricShadowMock.mockImplementationOnce(() => null);

  expect(
    configureLiveFreehandBrush(
      canvas as never,
      {
        color: '#00aa00',
        opacity: 0.35,
        shapeCorrection: 'subtle',
        shadow: 30,
        shadowAngle: 180,
        shadowColor: '#003300',
        smoothingLevel: 12,
        width: 9,
      },
      brush
    )
  ).toBe(brush);
  expect(brush).toMatchObject({
    color: '#00aa00:0.35',
    decimate: 1,
    shadow: null,
    width: 9,
  });
  expect(mocks.createFabricShadowMock).toHaveBeenCalledWith(30, '#003300', {
    angle: 180,
    blur: 12,
    distance: 4,
  });
});

it('uses the brush color as the fallback shadow color and clamps decimate', () => {
  const brush = new EditorFreehandBrush(canvas as never);

  configureLiveFreehandBrush(
    canvas as never,
    {
      color: '#001100',
      opacity: 0.35,
      shapeCorrection: 'subtle',
      shadow: 30,
      smoothingLevel: 6,
      width: 9,
    },
    brush
  );
  expect(mocks.createFabricShadowMock).toHaveBeenLastCalledWith(30, '#001100', {
    angle: 90,
    blur: 12,
    distance: 4,
  });
  expect(
    getBrushDecimate({
      color: '#000',
      opacity: 1,
      shapeCorrection: 'subtle',
      shadow: 0,
      smoothingLevel: -2,
      width: 1,
    })
  ).toBe(0);
});

function registerCommittedPointsReadTest() {
  it('reads committed points and stroke samples only from compatible brush instances', () => {
    expect(consumeCommittedFreehandPoints(null)).toBeNull();
    expect(consumeCommittedFreehandStrokeSamples(null)).toBeNull();
    expect(consumeCommittedFreehandPoints({} as never)).toBeNull();
    expect(consumeCommittedFreehandStrokeSamples({} as never)).toBeNull();
    expect(
      consumeCommittedFreehandPoints({
        consumeCommittedPoints: () => [
          { x: 1, y: 2 },
          { x: Number.NaN, y: 4 },
          { x: '5', y: 6 },
          { x: 5, y: 6 },
        ],
      } as never)
    ).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 6 },
    ]);
    expect(
      consumeCommittedFreehandStrokeSamples({
        consumeCommittedStrokeSamples: () => [
          { t: 10, x: 1, y: 2 },
          { t: Number.NaN, x: 3, y: 4 },
          { t: 30, x: '5', y: 6 },
          { t: 40, x: 5, y: 6 },
        ],
      } as never)
    ).toEqual([
      { t: 10, x: 1, y: 2 },
      { t: 40, x: 5, y: 6 },
    ]);
  });
}

function registerTimedStrokeSampleTest() {
  it('captures stroke sample timestamps from mouse events and keeps straight-line edits aligned', () => {
    const brush = new EditorFreehandBrush(canvas as never);
    const pointA = new Point(1, 2);
    const pointB = new Point(3, 4);

    brush.onMouseDown(pointA, { e: { timeStamp: 10 } } as never);
    brush.onMouseMove(pointB, { e: { timeStamp: 30 } } as never);
    brush._finalizeAndAddPath();

    expect(brush.consumeCommittedStrokeSamples()).toEqual([
      { t: 10, x: 1, y: 2 },
      { t: 30, x: 3, y: 4 },
    ]);

    const internalBrush = brush as unknown as {
      _addPoint: (point: Point) => boolean;
      _points: Point[];
      drawStraightLine: boolean;
      strokeSamples: Array<{ t: number; x: number; y: number }>;
    };
    internalBrush._points = [new Point(0, 0), new Point(5, 5)];
    internalBrush.strokeSamples = [
      { t: 10, x: 0, y: 0 },
      { t: 15, x: 5, y: 5 },
    ];
    internalBrush.drawStraightLine = true;
    internalBrush._addPoint(new Point(8, 8));

    expect(internalBrush._points).toEqual([new Point(0, 0), new Point(8, 8)]);
    expect(internalBrush.strokeSamples).toEqual([
      { t: 10, x: 0, y: 0 },
      { t: 30, x: 8, y: 8 },
    ]);
  });
}

function registerMouseUpSampleStabilityTest() {
  it('keeps committed samples identical to preview samples on mouseup', () => {
    const brush = new EditorFreehandBrush(canvas as never);
    const pointA = new Point(1, 2);
    const pointB = new Point(3, 4);

    brush.onMouseDown(pointA, { e: { timeStamp: 10 } } as never);
    brush.onMouseMove(pointB, { e: { timeStamp: 40 } } as never);
    brush.onMouseUp({ e: { timeStamp: 190 } } as never);

    expect(mocks.finalizeAndAddPathMock).toHaveBeenCalledOnce();
    expect(brush.consumeCommittedPoints()).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(brush.consumeCommittedStrokeSamples()).toEqual([
      { t: 10, x: 1, y: 2 },
      { t: 40, x: 3, y: 4 },
    ]);
  });
}

function runFreehandBrushSuite() {
  registerFinalizePathTest();
  registerCommittedPointsReadTest();
  registerTimedStrokeSampleTest();
  registerMouseUpSampleStabilityTest();
}

describe('editor-controller freehand brush seam', runFreehandBrushSuite);
