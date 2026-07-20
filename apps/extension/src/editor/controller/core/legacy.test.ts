/* eslint-disable max-lines-per-function --
   exact legacy proof needs local fabric doubles and grouped migration cases to stay readable */
import { describe, expect, it, vi } from 'vitest';

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
    sniptaleLabel?: string;
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
vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  isGroup: mocks.isGroupMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  createArrowObject: mocks.createArrowObjectMock,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));

import { beforeEach } from 'vitest';
import { upgradeLegacyArrowObjects } from './legacy';

function createArrowGroup(object: unknown, overrides: Record<string, unknown> = {}) {
  return Object.assign(new fabricMock.Group([object]), { sniptaleType: 'arrow', ...overrides });
}

describe('editor-controller legacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no canvas is available', () => {
    expect(upgradeLegacyArrowObjects(null)).toBeUndefined();
    expect(mocks.createArrowObjectMock).not.toHaveBeenCalled();
  });

  it('upgrades straight legacy arrow groups and preserves legacy metadata', () => {
    const group = createArrowGroup(new fabricMock.Line({ x1: 0, x2: 10, y1: 0, y2: 12 }), {
      sniptaleArrowEndHead: 'triangle',
      sniptaleArrowStartHead: 'triangle',
      sniptaleId: 'legacy-arrow',
      sniptaleLabel: 'A',
      sniptaleLocked: true,
      visible: false,
    });
    const canvas = new fabricMock.Canvas([group]);

    upgradeLegacyArrowObjects(canvas as never);

    const replacement = canvas.add.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(mocks.createArrowObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        control: null,
        id: 'legacy-arrow',
        label: 'A',
        settings: expect.objectContaining({
          endHead: 'triangle',
          startHead: 'triangle',
        }),
      })
    );
    expect(replacement['visible']).toBe(false);
    expect(replacement['sniptaleLocked']).toBe(true);
    expect(replacement['sniptaleLabel']).toBe('A');
    expect(canvas.moveObjectTo).toHaveBeenCalledWith(replacement, 0);
  });

  it('upgrades curve arrows and skips groups without valid geometry', () => {
    const curveGroup = createArrowGroup(
      new fabricMock.Path([
        ['M', 0, 0],
        ['Q', 8, 4, 16, 12],
      ]),
      { sniptaleArrowMode: 'curve' }
    );
    const invalidCurveGroup = createArrowGroup(
      new fabricMock.Path([
        ['M', 0, 0],
        ['Q', 'x', 4, 16, 12],
      ]),
      { sniptaleArrowMode: 'curve' }
    );
    const emptyGroup = createArrowGroup({});
    const canvas = new fabricMock.Canvas([curveGroup, invalidCurveGroup, emptyGroup]);

    upgradeLegacyArrowObjects(canvas as never);

    expect(mocks.createArrowObjectMock).toHaveBeenCalledTimes(1);
    expect(mocks.createArrowObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        control: expect.objectContaining({ x: 8, y: 4 }),
      })
    );
    expect(canvas.remove).toHaveBeenCalledTimes(1);
    expect(canvas.add).toHaveBeenCalledTimes(1);
  });

  it('upgrades straight path arrows with fallback settings and generated ids', () => {
    const randomUUID = vi.fn(() => 'generated-arrow-id');
    vi.stubGlobal('crypto', { randomUUID });

    const path = new fabricMock.Path([
      ['M', 2, 4],
      ['L', 12, 18],
    ]);
    path.stroke = null;
    path.strokeWidth = undefined as unknown as number;
    const group = createArrowGroup(path);
    const canvas = new fabricMock.Canvas([group]);

    upgradeLegacyArrowObjects(canvas as never);

    expect(randomUUID).toHaveBeenCalledOnce();
    expect(mocks.createArrowObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        control: null,
        id: 'generated-arrow-id',
        settings: expect.objectContaining({
          color: '#000000',
          mode: 'straight',
          width: 5,
        }),
      })
    );
    expect(mocks.createArrowObjectMock.mock.calls[0]?.[0]).not.toHaveProperty('label');
  });
});
