/* eslint-disable max-lines-per-function --
   local Fabric doubles keep adjacent legacy owner proof self-contained */
import { beforeEach, expect, it, vi } from 'vitest';

const fabricMock = vi.hoisted(() => {
  class Point {
    constructor(
      public x: number,
      public y: number
    ) {}
    transform() {
      return this;
    }
  }

  class Path {
    pathOffset = { x: 0, y: 0 };
    stroke: string | null = '#123456';
    strokeWidth = 4;
    constructor(public path: Array<Array<string | number>>) {}
    calcTransformMatrix() {
      return {};
    }
  }

  class Line {
    stroke: string | null = '#654321';
    strokeWidth = 3;
    constructor(private points: { x1: number; x2: number; y1: number; y2: number }) {}
    calcLinePoints() {
      return this.points;
    }
    calcTransformMatrix() {
      return {};
    }
  }

  class Group {
    sniptaleArrowEndHead?: string;
    sniptaleArrowMode?: string;
    sniptaleArrowStartHead?: string;
    sniptaleId?: string;
    sniptaleLabel?: string;
    sniptaleLocked?: boolean;
    sniptaleType?: string;
    visible = true;
    constructor(private objects: unknown[]) {}
    getObjects() {
      return this.objects;
    }
  }

  class Canvas {
    constructor(private objects: unknown[]) {}
    add = vi.fn((object: unknown) => {
      this.objects.push(object);
    });
    getObjects() {
      return this.objects;
    }
    moveObjectTo = vi.fn();
    remove = vi.fn((object: unknown) => {
      this.objects = this.objects.filter((item) => item !== object);
    });
  }

  return { Canvas, Group, Line, Path, Point };
});

const mocks = vi.hoisted(() => ({
  createArrowObjectMock: vi.fn((options: Record<string, unknown>) => ({
    ...options,
    visible: true,
  })),
  isGroupMock: vi.fn((value) => value instanceof fabricMock.Group),
  parseColorForStoreMock: vi.fn(
    (value: string | null | undefined, fallback: string) => value ?? fallback
  ),
  storeGetStateMock: vi.fn(() => ({
    toolSettings: {
      arrow: {
        color: '#000000',
        endHead: 'triangle',
        mode: 'straight',
        startHead: 'none',
        width: 5,
      },
    },
  })),
}));

vi.mock('fabric', () => fabricMock);
vi.mock('../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers')>()),
  isGroup: mocks.isGroupMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/arrow')>()),
  createArrowObject: mocks.createArrowObjectMock,
}));
vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));

import { upgradeLegacyArrowObjects } from './canvas';
import { extractLegacyArrowGeometry } from './geometry';
import { createLegacyArrowReplacement } from './replacement';

beforeEach(() => {
  vi.clearAllMocks();
});

it('extracts curve geometry from legacy path commands', () => {
  const path = new fabricMock.Path([
    ['M', 1, 2],
    ['Q', 3, 4, 5, 6],
  ]);

  expect(extractLegacyArrowGeometry(path as never, 'curve')).toEqual({
    control: expect.objectContaining({ x: 3, y: 4 }),
    end: expect.objectContaining({ x: 5, y: 6 }),
    start: expect.objectContaining({ x: 1, y: 2 }),
  });
});

it('creates replacement arrows from legacy metadata and fallback settings', () => {
  const line = new fabricMock.Line({ x1: 0, x2: 10, y1: 0, y2: 12 });
  const group = Object.assign(new fabricMock.Group([line]), {
    sniptaleArrowEndHead: 'diamond',
    sniptaleId: 'legacy-arrow',
    sniptaleLabel: 'A',
    sniptaleLocked: true,
    sniptaleType: 'arrow',
    visible: false,
  });

  const replacement = createLegacyArrowReplacement(group as never) as unknown as Record<
    string,
    unknown
  >;

  expect(mocks.createArrowObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      control: null,
      id: 'legacy-arrow',
      label: 'A',
      settings: expect.objectContaining({
        color: '#654321',
        endHead: 'diamond',
        startHead: 'none',
        width: 3,
      }),
    })
  );
  expect(replacement['sniptaleLocked']).toBe(true);
  expect(replacement['visible']).toBe(false);
});

it('replaces only valid legacy arrow groups on the canvas', () => {
  const arrowGroup = Object.assign(
    new fabricMock.Group([new fabricMock.Line({ x1: 0, x2: 10, y1: 0, y2: 12 })]),
    { sniptaleType: 'arrow' }
  );
  const ignoredGroup = Object.assign(new fabricMock.Group([]), { sniptaleType: 'note' });
  const canvas = new fabricMock.Canvas([arrowGroup, ignoredGroup]);

  upgradeLegacyArrowObjects(canvas as never);

  expect(canvas.remove).toHaveBeenCalledWith(arrowGroup);
  expect(canvas.add).toHaveBeenCalledTimes(1);
  expect(canvas.moveObjectTo).toHaveBeenCalledWith(expect.any(Object), 0);
});
