import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadowMock: vi.fn(() => ({ blur: 6 })),
  hexToRgbaMock: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
}));

type MockPathCommand = Array<string | number>;

function measureMockPathOffset(path: MockPathCommand[]) {
  const coordinates = path.flatMap((command) => {
    const next: Array<{ x: number; y: number }> = [];
    for (let index = 1; index < command.length - 1; index += 2) {
      const x = command[index];
      const y = command[index + 1];
      if (typeof x === 'number' && typeof y === 'number') {
        next.push({ x, y });
      }
    }
    return next;
  });
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

vi.mock('fabric', () => ({
  Path: class Path {
    left?: number;
    path: MockPathCommand[];
    pathOffset = { x: 0, y: 0 };
    setCoords = vi.fn();
    top?: number;

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
  },
  PencilBrush: class PencilBrush {
    canvas: { getZoom: () => number };
    decimate = 0;

    constructor(canvas: { getZoom: () => number }) {
      this.canvas = canvas;
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
vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  createObjectLabel: (type: string, index: number) => `${type}-${index}`,
  hexToRgba: mocks.hexToRgbaMock,
}));

import { Path } from 'fabric';
import type { EditorBrushSettings } from '../../../features/editor/document/types';
import { readFreehandColorInput } from './path-readers';
import { applyFreehandSettingsToObject } from './path/apply';
import { configureFreehandPath } from './path/configure';

const brushSettings: EditorBrushSettings = {
  color: '#ff0000',
  opacity: 0.5,
  shapeCorrection: 'subtle',
  shadow: 30,
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-freehand' });
});

it('configures dynamic-width paths as filled outlines with persisted stroke samples', () => {
  const path = new Path([
    ['M', 0, 0],
    ['L', 80, 0],
    ['L', 160, 0],
  ]) as Path & {
    sniptaleBrushDynamicWidth?: boolean;
    sniptaleBrushSamplesJson?: string;
    sniptaleBrushWidth?: number;
  };

  configureFreehandPath({
    brush: {
      consumeCommittedPoints: () => [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 160, y: 0 },
      ],
      consumeCommittedStrokeSamples: () => [
        { t: 0, x: 0, y: 0 },
        { t: 16, x: 80, y: 0 },
        { t: 32, x: 160, y: 0 },
      ],
    } as never,
    labelIndex: 5,
    path: path as never,
    settings: { ...brushSettings, dynamicWidth: true, width: 8 },
    tool: 'pencil',
  });

  expect(path.path.some((command) => command[0] === 'L')).toBe(true);
  expect(path.sniptaleBrushDynamicWidth).toBe(true);
  expect(path.sniptaleBrushWidth).toBe(8);
  expect(path.sniptaleBrushSamplesJson).toBe(
    '[{"t":0,"x":0,"y":0},{"t":16,"x":80,"y":0},{"t":32,"x":160,"y":0}]'
  );
  expect(path['fill']).toBe('#ff0000:0.5');
  expect(path['stroke']).toBe('transparent');
  expect(path['strokeWidth']).toBe(0);
});

it('reapplies dynamic-width settings from persisted samples without losing the visible color', () => {
  const path = createLegacyPath();
  path.sniptaleType = 'pencil';
  path.sniptaleBrushPointsJson = '[{"x":0,"y":0},{"x":80,"y":0},{"x":160,"y":0}]';
  path.sniptaleBrushSamplesJson =
    '[{"t":0,"x":0,"y":0},{"t":16,"x":80,"y":0},{"t":32,"x":160,"y":0}]';

  applyFreehandSettingsToObject(
    path as never,
    { ...brushSettings, color: '#00ff00', dynamicWidth: true, width: 8 } as never
  );

  expect(path.path.some((command) => command[0] === 'L')).toBe(true);
  expect(readFreehandColorInput(path as never)).toBe('#00ff00:0.5');
  expect(path['stroke']).toBe('transparent');
  expect(path.sniptaleBrushSamplesJson).toBe(
    '[{"t":0,"x":0,"y":0},{"t":16,"x":80,"y":0},{"t":32,"x":160,"y":0}]'
  );
});
