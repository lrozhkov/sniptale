import { describe, expect, it, vi } from 'vitest';

vi.mock('fabric', () => ({
  Path: class Path {
    controls: Record<string, unknown> = {};
    pathOffset = { x: 0, y: 0 };

    constructor(
      public path: string | unknown,
      values: Record<string, unknown> = {}
    ) {
      Object.assign(this, values);
    }

    set(arg1: string | Record<string, unknown>, arg2?: unknown) {
      if (typeof arg1 === 'string') {
        (this as Record<string, unknown>)[arg1] = arg2;
      } else {
        Object.assign(this, arg1);
      }
      return this;
    }

    setCoords() {}

    setDimensions() {
      this.pathOffset = { x: 5, y: 7 };
    }
  },
}));

import { Path } from 'fabric';
import { applyArrowObjectState, resolveArrowUpdatePoints } from './state';

const straightSettings = {
  color: '#09f',
  endHead: 'none',
  mode: 'straight',
  opacity: 0.8,
  shadow: 0,
  startHead: 'none',
  variant: 'standard',
  width: 2,
} as const;

function registerResolvePointGuardTest() {
  it('falls back to rebuilt straight-arrow points when no points are provided', () => {
    expect(
      resolveArrowUpdatePoints(
        [],
        {
          ...straightSettings,
          color: '#f60',
          endHead: 'triangle',
          opacity: 1,
          width: 4,
        },
        {
          end: { x: 14, y: 6 },
          points: [],
          start: { x: 1, y: 1 },
        }
      )
    ).toEqual([
      { x: 1, y: 1 },
      { x: 14, y: 6 },
    ]);
    expect(
      resolveArrowUpdatePoints(
        [
          { x: 0, y: 0 },
          { x: 20, y: 10 },
        ],
        straightSettings,
        {
          control: { x: 8, y: 5 },
          end: { x: 20, y: 10 },
          points: [{ x: 4 } as never],
          start: { x: 2, y: 3 },
        }
      )
    ).toEqual([
      { x: 2, y: 3 },
      { x: 8, y: 5 },
      { x: 20, y: 10 },
    ]);
  });
}

function registerStraightArrowAppearanceTest() {
  it('applies straight-arrow fill without control-point metadata', () => {
    const arrow = new Path('', {
      left: 4,
      sniptaleType: 'arrow',
      pathOffset: { x: 0, y: 0 },
      top: 6,
    }) as unknown as Record<string, unknown>;

    applyArrowObjectState(
      arrow as never,
      straightSettings,
      [
        { x: 2, y: 2 },
        { x: 12, y: 8 },
      ],
      () => ({ line: {} as never })
    );

    expect(arrow['sniptaleArrowControlX']).toBeUndefined();
    expect(arrow['sniptaleArrowControlY']).toBeUndefined();
    expect(String(arrow['fill'])).toContain('rgba');
    expect(arrow['strokeWidth']).toBe(0);
  });
}

function runArrowStateGuardSuite() {
  registerResolvePointGuardTest();
  registerStraightArrowAppearanceTest();
}

describe('arrow state guard branches', runArrowStateGuardSuite);
