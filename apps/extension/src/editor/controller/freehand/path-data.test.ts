import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  createFabricShadowMock: vi.fn(() => null),
  decimatePointsMock: vi.fn(<T>(points: T[]) => points.filter((_, index) => index !== 1)),
  hexToRgbaMock: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
}));
vi.mock('fabric', () => ({
  PencilBrush: class PencilBrush {
    canvas: { getZoom: () => number };
    color = '';
    decimate = 0;
    shadow: unknown = null;
    width = 1;
    constructor(canvas: { getZoom: () => number }) {
      this.canvas = canvas;
    }
    decimatePoints<T>(points: T[]) {
      return mocks.decimatePointsMock(points);
    }
    convertPointsToSVGPath(points: Array<{ x: number; y: number }>) {
      return points.map((point, index) =>
        index === 0 ? ['M', point.x, point.y] : ['L', point.x, point.y]
      );
    }
    createPath(pathData: Array<Array<string | number>>) {
      return { path: pathData };
    }
  },
  Point: class Point {
    constructor(
      public x: number,
      public y: number
    ) {}
  },
}));
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
import type { EditorBrushSettings } from '../../../features/editor/document/types';
import { buildFreehandPathData } from './path-data';
function extractYCoordinates(pathData: NonNullable<ReturnType<typeof buildFreehandPathData>>) {
  return extractCoordinates(pathData).map((point) => point.y);
}
function extractCoordinates(pathData: NonNullable<ReturnType<typeof buildFreehandPathData>>) {
  return pathData.flatMap((command) => {
    const coordinates: Array<{ x: number; y: number }> = [];
    for (let index = 1; index < command.length - 1; index += 2) {
      const x = command[index];
      const y = command[index + 1];
      if (typeof x === 'number' && typeof y === 'number') {
        coordinates.push({ x, y });
      }
    }
    return coordinates;
  });
}
function measureYRange(pathData: NonNullable<ReturnType<typeof buildFreehandPathData>>) {
  const ys = extractYCoordinates(pathData);
  return Math.max(...ys) - Math.min(...ys);
}
function measureLocalYRange(
  pathData: NonNullable<ReturnType<typeof buildFreehandPathData>>,
  minX: number,
  maxX: number
) {
  const ys = extractCoordinates(pathData)
    .filter((point) => point.x >= minX && point.x <= maxX)
    .map((point) => point.y);
  return Math.max(...ys) - Math.min(...ys);
}
const subtleBrushSettings: EditorBrushSettings = {
  color: '#ff0000',
  opacity: 1,
  shapeCorrection: 'subtle',
  shadow: 0,
  smoothingLevel: 4,
  width: 4,
};
beforeEach(() => {
  mocks.decimatePointsMock.mockClear();
});
it('returns null for empty freehand point lists', () => {
  expect(buildFreehandPathData([], subtleBrushSettings, null)).toBeNull();
});
it('uses the raw points when smoothing produces zero decimation', () => {
  const pathData = buildFreehandPathData(
    [
      { x: 0, y: 0 },
      { x: 15, y: 12 },
      { x: 30, y: 6 },
    ],
    { ...subtleBrushSettings, smoothingLevel: 0 },
    { getZoom: () => 1 } as never
  );
  expect(pathData).toEqual([
    ['M', 0, 0],
    ['L', 15, 12],
    ['L', 30, 6],
  ]);
  expect(mocks.decimatePointsMock).not.toHaveBeenCalled();
});
it('routes points through brush decimation when smoothing enables it', () => {
  const pathData = buildFreehandPathData(
    [
      { x: 0, y: 0 },
      { x: 15, y: 12 },
      { x: 30, y: 6 },
    ],
    { ...subtleBrushSettings, smoothingLevel: 8 },
    { getZoom: () => 1 } as never
  );
  expect(mocks.decimatePointsMock).toHaveBeenCalledOnce();
  expect(pathData).toEqual([
    ['M', 0, 0],
    ['L', 30, 6],
  ]);
});
it('builds a filled outline path when pencil dynamic width is enabled', () => {
  const pathData = buildFreehandPathData(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 60, y: 0 },
    ],
    { ...subtleBrushSettings, dynamicWidth: true, width: 8 },
    { getZoom: () => 1 } as never,
    [
      { t: 0, x: 0, y: 0 },
      { t: 80, x: 20, y: 0 },
      { t: 96, x: 60, y: 0 },
    ]
  );

  expect(pathData?.[0]?.[0]).toBe('M');
  expect(pathData?.at(-1)?.[0]).toBe('Z');
  expect(pathData?.length).toBeGreaterThan(4);
  expect(mocks.decimatePointsMock).not.toHaveBeenCalled();
});
it('renders dynamic-width tap strokes as one compact dot', () => {
  const singlePointDot = buildFreehandPathData(
    [{ x: 10, y: 20 }],
    { ...subtleBrushSettings, dynamicWidth: true, width: 8 },
    { getZoom: () => 1 } as never,
    [{ t: 0, x: 10, y: 20 }]
  );
  const duplicatePointDot = buildFreehandPathData(
    [
      { x: 10, y: 20 },
      { x: 10, y: 20 },
    ],
    { ...subtleBrushSettings, dynamicWidth: true, width: 8 },
    { getZoom: () => 1 } as never,
    [
      { t: 0, x: 10, y: 20 },
      { t: 16, x: 10, y: 20 },
    ]
  );
  expect(singlePointDot).toEqual(duplicatePointDot);
  expect(duplicatePointDot?.[0]?.[0]).toBe('M');
  expect(duplicatePointDot?.at(-1)?.[0]).toBe('Z');
  const distances = extractCoordinates(duplicatePointDot!).map((point) =>
    Math.hypot(point.x - 10, point.y - 20)
  );
  expect(distances.length).toBeGreaterThan(8);
  expect(Math.min(...distances)).toBeGreaterThan(3.5);
  expect(Math.max(...distances)).toBeLessThan(4.5);
});
it('starts thin when the pointer starts moving quickly', () => {
  const pathData = buildFreehandPathData(
    [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 160, y: 0 },
    ],
    { ...subtleBrushSettings, dynamicWidth: true, smoothingLevel: 0, width: 8 },
    { getZoom: () => 1 } as never,
    [
      { t: 0, x: 0, y: 0 },
      { t: 16, x: 80, y: 0 },
      { t: 32, x: 160, y: 0 },
    ]
  );
  expect(pathData?.[0]?.[0]).toBe('M');
  expect(Number(pathData?.[0]?.[2])).toBeLessThanOrEqual(2);
});
it('makes high smoothing visibly dampen centerline jitter for dynamic width strokes', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 12, y: 8 },
    { x: 24, y: -8 },
    { x: 36, y: 8 },
    { x: 48, y: -8 },
    { x: 60, y: 0 },
  ];
  const samples = points.map((point, index) => ({ ...point, t: index * 16 }));
  const lowSmoothing = buildFreehandPathData(
    points,
    { ...subtleBrushSettings, dynamicWidth: true, smoothingLevel: 0, width: 6 },
    { getZoom: () => 1 } as never,
    samples
  );
  const highSmoothing = buildFreehandPathData(
    points,
    { ...subtleBrushSettings, dynamicWidth: true, smoothingLevel: 10, width: 6 },
    { getZoom: () => 1 } as never,
    samples
  );
  expect(lowSmoothing).not.toBeNull();
  expect(highSmoothing).not.toBeNull();
  expect(measureYRange(highSmoothing!)).toBeLessThan(measureYRange(lowSmoothing!));
});
it('keeps explicit sharp corners instead of smoothing them away', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 30 },
    { x: 60, y: 30 },
  ];
  const samples = points.map((point, index) => ({ ...point, t: index * 16 }));
  const lowSmoothing = buildFreehandPathData(
    points,
    { ...subtleBrushSettings, dynamicWidth: true, smoothingLevel: 0, width: 6 },
    { getZoom: () => 1 } as never,
    samples
  );
  const highSmoothing = buildFreehandPathData(
    points,
    { ...subtleBrushSettings, dynamicWidth: true, smoothingLevel: 10, width: 6 },
    { getZoom: () => 1 } as never,
    samples
  );
  expect(lowSmoothing).not.toBeNull();
  expect(highSmoothing).not.toBeNull();
  expect(measureYRange(highSmoothing!)).toBeGreaterThan(measureYRange(lowSmoothing!) * 0.9);
});
it('rounds sharp dynamic-width joins instead of collapsing them into angular vertices', () => {
  const pathData = buildFreehandPathData(
    [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
    ],
    { ...subtleBrushSettings, dynamicWidth: true, smoothingLevel: 0, width: 12 },
    { getZoom: () => 1 } as never,
    [
      { t: 0, x: 0, y: 0 },
      { t: 120, x: 30, y: 0 },
      { t: 240, x: 30, y: 30 },
    ]
  );
  expect(pathData).not.toBeNull();
  const localCornerPoints = extractCoordinates(pathData!).filter(
    (point) => Math.hypot(point.x - 30, point.y) <= 7
  );
  const uniqueCornerPoints = new Set(
    localCornerPoints.map((point) => `${point.x.toFixed(2)}:${point.y.toFixed(2)}`)
  );
  expect(uniqueCornerPoints.size).toBeGreaterThan(4);
});
it('keeps cap width close to the neighboring stroke width', () => {
  const pathData = buildFreehandPathData(
    [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 120, y: 0 },
    ],
    { ...subtleBrushSettings, dynamicWidth: true, smoothingLevel: 10, width: 12 },
    { getZoom: () => 1 } as never,
    [
      { t: 0, x: 0, y: 0 },
      { t: 16, x: 80, y: 0 },
      { t: 176, x: 120, y: 0 },
    ]
  );
  expect(pathData).not.toBeNull();
  const bodyRange = measureLocalYRange(pathData!, 55, 75);
  const startRange = measureLocalYRange(pathData!, -6, 6);
  const endRange = measureLocalYRange(pathData!, 114, 126);
  const xs = extractCoordinates(pathData!).map((point) => point.x);
  expect(Math.min(...xs)).toBeLessThan(0);
  expect(Math.max(...xs)).toBeGreaterThan(120);
  expect(startRange).toBeLessThanOrEqual(bodyRange * 1.2);
  expect(endRange).toBeLessThanOrEqual(bodyRange * 1.2);
});
