import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadowMock: vi.fn(() => ({ blur: 6 })),
  hexToRgbaMock: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
}));
type MockPathCommand = Array<string | number>;
function extractCommandCoordinates(command: MockPathCommand) {
  const coordinates: Array<{ x: number; y: number }> = [];
  for (let index = 1; index < command.length - 1; index += 2) {
    const x = command[index];
    const y = command[index + 1];
    if (typeof x === 'number' && typeof y === 'number') {
      coordinates.push({ x, y });
    }
  }
  return coordinates;
}
function measureMockPathOffset(path: MockPathCommand[]) {
  const coordinates = path.flatMap(extractCommandCoordinates);
  if (coordinates.length === 0) {
    return { x: 0, y: 0 };
  }

  const xs = coordinates.map((point) => point.x);
  const ys = coordinates.map((point) => point.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}
function createMockPathClass() {
  return class Path {
    canvas?: { getZoom: () => number };
    left?: number;
    path: MockPathCommand[];
    pathOffset = { x: 0, y: 0 };
    top?: number;
    setCoords = vi.fn();

    constructor(path: MockPathCommand[], options: Record<string, unknown> = {}) {
      this.path = path;
      Object.assign(this, options);
      this.syncDerivedState(false);
    }

    _setPath(path: MockPathCommand[]) {
      this.path = path;
      this.syncDerivedState(true);
    }

    set(values: Record<string, unknown>) {
      Object.assign(this, values);
      return this;
    }

    private syncDerivedState(resetPosition: boolean) {
      this.pathOffset = measureMockPathOffset(this.path);
      if (resetPosition || typeof this.left !== 'number' || typeof this.top !== 'number') {
        this.left = this.pathOffset.x;
        this.top = this.pathOffset.y;
      }
    }
  };
}
function createMockPencilBrushClass() {
  return class PencilBrush {
    canvas: { getZoom: () => number };
    color = '';
    decimate = 0;
    shadow: unknown = null;
    width = 1;

    constructor(canvas: { getZoom: () => number }) {
      this.canvas = canvas;
    }

    decimatePoints<T>(points: T[]) {
      return points;
    }

    convertPointsToSVGPath(points: Array<{ x: number; y: number }>) {
      return points.map((point, index) =>
        index === 0 ? ['M', point.x, point.y] : ['L', point.x, point.y]
      );
    }

    createPath(pathData: MockPathCommand[]) {
      return { path: pathData };
    }
  };
}
vi.mock('fabric', () => ({
  Path: createMockPathClass(),
  PencilBrush: createMockPencilBrushClass(),
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
    createObjectLabel: (type: string, index: number) => `${type}-${index}`,
    hexToRgba: mocks.hexToRgbaMock,
  };
});
import { Path } from 'fabric';
import type { EditorBrushSettings } from '../../../features/editor/document/types';
import {
  readFreehandShadowAngle,
  readFreehandShadowColor,
  readFreehandSmoothingLevel,
} from './path-readers';
import { applyFreehandSettingsToObject } from './path/apply';
import { configureFreehandPath } from './path/configure';

const brushSettings: EditorBrushSettings = {
  color: '#ff0000',
  opacity: 0.5,
  shapeCorrection: 'subtle',
  shadow: 30,
  shadowAngle: 135,
  shadowColor: '#440000',
  smoothingLevel: 8,
  width: 6,
};

function createLegacyPath() {
  return new Path([
    ['M', 0, 0],
    ['Q', 5, 5, 10, 10],
    ['L', 15, 15],
  ]) as Path & {
    sniptaleBrushPointsJson?: string;
    sniptaleBrushSamplesJson?: string;
    sniptaleBrushShadow?: number;
    sniptaleBrushShadowAngle?: number;
    sniptaleBrushShadowColor?: string;
    sniptaleBrushSmoothing?: number;
  };
}

function registerConfigurePathTest() {
  it('configures new freehand paths with smoothing metadata and committed points', () => {
    const path = { set: vi.fn() };

    configureFreehandPath({
      brush: {
        consumeCommittedPoints: () => [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      } as never,
      labelIndex: 4,
      path: path as never,
      settings: brushSettings,
      tool: 'pencil',
    });

    expect(path).toMatchObject({
      sniptaleBrushPointsJson: '[{"x":1,"y":2},{"x":3,"y":4}]',
      sniptaleBrushShadow: 30,
      sniptaleBrushShadowAngle: 135,
      sniptaleBrushShadowColor: '#440000',
      sniptaleBrushSmoothing: 8,
      sniptaleId: 'uuid-freehand',
      sniptaleLabel: 'pencil-4',
      sniptaleRole: 'annotation',
      sniptaleType: 'pencil',
    });
    expect(path.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stroke: '#ff0000:0.5',
        strokeUniform: true,
        strokeWidth: 6,
      })
    );
    expect(mocks.createFabricShadowMock).toHaveBeenCalledWith(30, '#440000', {
      angle: 135,
      blur: 12,
      distance: 4,
    });
  });
}

function registerLegacyRebuildTest() {
  it('rebuilds legacy freehand paths from current path commands and persists recovered points', () => {
    const path = createLegacyPath();

    applyFreehandSettingsToObject(path as never, brushSettings as never);

    expect(path.path).toEqual([
      ['M', 0, 0],
      ['L', 5, 5],
      ['L', 10, 10],
      ['L', 15, 15],
    ]);
    expect(path.sniptaleBrushPointsJson).toBe(
      '[{"x":0,"y":0},{"x":5,"y":5},{"x":10,"y":10},{"x":15,"y":15}]'
    );
    expect(path.sniptaleBrushShadow).toBe(30);
    expect(path.sniptaleBrushShadowAngle).toBe(135);
    expect(path.sniptaleBrushShadowColor).toBe('#440000');
    expect(path.sniptaleBrushSmoothing).toBe(8);
    expect(path['strokeUniform']).toBe(true);
    expect(path.setCoords).toHaveBeenCalledOnce();
  });
}

function registerLegacyShadowFallbackTest() {
  it('falls back freehand shadow metadata to the stroke color and downward angle', () => {
    const path = createLegacyPath();
    const {
      shadowAngle: _shadowAngle,
      shadowColor: _shadowColor,
      ...settingsWithoutShadowDetails
    } = brushSettings;

    applyFreehandSettingsToObject(path as never, settingsWithoutShadowDetails);

    expect(path.sniptaleBrushShadowAngle).toBe(90);
    expect(path.sniptaleBrushShadowColor).toBe('#ff0000');
    expect(mocks.createFabricShadowMock).toHaveBeenCalledWith(30, '#ff0000', {
      angle: 90,
      blur: 12,
      distance: 4,
    });
  });
}

function registerMovedPathReapplyTest() {
  it('keeps moved freehand paths in place when inspector settings are reapplied', () => {
    const path = createLegacyPath();
    path.left = 107.5;
    path.top = 207.5;
    path.sniptaleBrushPointsJson = '[{"x":0,"y":0},{"x":5,"y":5},{"x":10,"y":10},{"x":15,"y":15}]';

    applyFreehandSettingsToObject(path as never, brushSettings as never);

    expect(path.left).toBe(107.5);
    expect(path.top).toBe(207.5);
    expect(path.path).toEqual([
      ['M', 100, 200],
      ['L', 105, 205],
      ['L', 110, 210],
      ['L', 115, 215],
    ]);
    expect(path.sniptaleBrushPointsJson).toBe(
      '[{"x":100,"y":200},{"x":105,"y":205},{"x":110,"y":210},{"x":115,"y":215}]'
    );
  });
}

function registerReadSmoothingTest() {
  it('reads persisted smoothing metadata with a fallback for legacy paths', () => {
    expect(readFreehandSmoothingLevel({ sniptaleBrushSmoothing: 9 } as never, 4)).toBe(9);
    expect(readFreehandSmoothingLevel({} as never, 4)).toBe(4);
  });
}

function registerReadShadowMetadataTest() {
  it('reads persisted shadow direction and color with legacy fallbacks', () => {
    expect(readFreehandShadowAngle({ sniptaleBrushShadowAngle: 45 } as never, 90)).toBe(45);
    expect(readFreehandShadowAngle({} as never, 90)).toBe(90);
    expect(
      readFreehandShadowColor({ sniptaleBrushShadowColor: '#123456' } as never, '#000000')
    ).toBe('#123456');
    expect(readFreehandShadowColor({} as never, '#000000')).toBe('#000000');
  });
}

function runFreehandPathSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-freehand' });
  });

  registerConfigurePathTest();
  registerLegacyRebuildTest();
  registerLegacyShadowFallbackTest();
  registerMovedPathReapplyTest();
  registerReadSmoothingTest();
  registerReadShadowMetadataTest();
}

describe('editor-controller freehand path seam', runFreehandPathSuite);
