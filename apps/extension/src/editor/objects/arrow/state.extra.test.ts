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
  Shadow: class Shadow {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
    }
  },
}));

import { Path, Shadow } from 'fabric';
import {
  applyArrowObjectState,
  pickArrowPointUpdateOptions,
  resolveArrowUpdatePoints,
} from './state';

function registerResolveHandlePointTest() {
  it('resolves arrow update points from start, control, and end handles', () => {
    expect(
      resolveArrowUpdatePoints(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        {
          color: '#f60',
          endHead: 'triangle',
          mode: 'curve',
          opacity: 1,
          shadow: 0,
          startHead: 'none',
          variant: 'standard',
          width: 4,
        },
        {
          control: { x: 5, y: 8 },
          end: { x: 16, y: 2 },
          start: { x: 1, y: 1 },
        }
      )
    ).toEqual([
      { x: 1, y: 1 },
      { x: 5, y: 8 },
      { x: 16, y: 2 },
    ]);
  });
}

function registerPickDefinedOptionsTest() {
  it('picks only defined point update options when rebuilding arrow geometry', () => {
    expect(
      pickArrowPointUpdateOptions({
        control: null,
        end: { x: 16, y: 2 },
        start: { x: 1, y: 1 },
      })
    ).toEqual({
      control: null,
      end: { x: 16, y: 2 },
      start: { x: 1, y: 1 },
    });
  });
}

function registerFallbackPointBuildTest() {
  it('builds fallback points from handle options when no previous points exist', () => {
    expect(
      resolveArrowUpdatePoints(
        [],
        {
          color: '#f60',
          endHead: 'triangle',
          mode: 'straight',
          opacity: 1,
          shadow: 0,
          startHead: 'none',
          variant: 'standard',
          width: 4,
        },
        {
          end: { x: 16, y: 2 },
          start: { x: 1, y: 1 },
        }
      )
    ).toEqual([
      { x: 1, y: 1 },
      { x: 16, y: 2 },
    ]);
  });
}

function registerApplyCurveStateTest() {
  it('applies arrow metadata and redraw state to path objects', () => {
    const arrow = new Path('M 0 0 L 0 0', {
      left: 10,
      sniptaleType: 'arrow',
      pathOffset: { x: 2, y: 3 },
      top: 12,
    }) as unknown as Record<string, unknown>;

    applyArrowObjectState(
      arrow as never,
      {
        color: '#f60',
        endHead: 'triangle',
        mode: 'curve',
        opacity: 0.65,
        shadow: 100,
        shadowAngle: 180,
        shadowColor: '#123456',
        startHead: 'circle',
        variant: 'standard',
        width: 6,
      },
      [
        { x: 0, y: 0 },
        { x: 15, y: 20 },
        { x: 30, y: 10 },
      ],
      () => ({ handle: {} as never })
    );

    expect(arrow['sniptaleArrowMode']).toBe('curve');
    expect(arrow['sniptaleArrowShadow']).toBe(100);
    expect([arrow['sniptaleArrowShadowAngle'], arrow['sniptaleArrowShadowColor']]).toEqual([
      180,
      '#123456',
    ]);
    expect(arrow['sniptaleArrowControlX']).toBe(15);
    expect(arrow['strokeWidth']).toBe(0);
    expect(String(arrow['fill'])).toContain('rgba');
    expect(arrow['shadow']).toBeInstanceOf(Shadow);
    expect(arrow['hoverCursor']).toBe('move');
    expect(arrow['dirty']).toBe(true);
  });
}

function registerApplyStraightStateTest() {
  it('clears curve control metadata when the arrow resolves to a straight segment', () => {
    const arrow = new Path('M 0 0 L 0 0', {
      left: 10,
      sniptaleArrowControlX: 12,
      sniptaleArrowControlY: 18,
      sniptaleType: 'arrow',
      pathOffset: { x: 2, y: 3 },
      top: 12,
    }) as unknown as Record<string, unknown>;

    applyArrowObjectState(
      arrow as never,
      {
        color: '#f60',
        endHead: 'triangle',
        mode: 'straight',
        opacity: 0.65,
        shadow: 0,
        startHead: 'circle',
        variant: 'standard',
        width: 6,
      },
      [
        { x: 0, y: 0 },
        { x: 30, y: 10 },
      ],
      () => ({ handle: {} as never })
    );

    expect(arrow['sniptaleArrowControlX']).toBeUndefined();
    expect(arrow['sniptaleArrowControlY']).toBeUndefined();
    expect(arrow['shadow']).toBeUndefined();
  });
}

function createBlockArrowRecord() {
  return new Path('M 0 0 L 0 0', {
    left: 10,
    sniptaleType: 'arrow',
    pathOffset: { x: 2, y: 3 },
    top: 12,
  }) as unknown as Record<string, unknown>;
}

function applyBlockArrowState(arrow: Record<string, unknown>) {
  applyArrowObjectState(
    arrow as never,
    {
      color: '#f60',
      endHead: 'triangle',
      mode: 'curve',
      opacity: 1,
      shadow: 0,
      startHead: 'circle',
      variant: 'tapered',
      width: 8,
    },
    [
      { x: 0, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ],
    () => ({})
  );
}

it('applies arrow-native interaction metadata for block arrows', () => {
  const arrow = createBlockArrowRecord();

  applyBlockArrowState(arrow);

  expect(arrow['sniptaleArrowVariant']).toBe('tapered');
  expect(arrow['hoverCursor']).toBe('move');
  expect(arrow['lockScalingX']).toBe(false);
  expect(arrow['lockScalingY']).toBe(false);
  expect(arrow['hasBorders']).toBe(true);
  arrow['sniptaleArrowEditMode'] = true;

  applyBlockArrowState(arrow);

  expect(arrow['hoverCursor']).toBe('pointer');
  expect(arrow['lockScalingX']).toBe(true);
  expect(arrow['lockScalingY']).toBe(true);
  expect(arrow['hasBorders']).toBe(false);
  arrow['sniptaleArrowEditMode'] = false;
  arrow['sniptaleArrowDrawing'] = true;

  applyBlockArrowState(arrow);

  expect(arrow['lockScalingX']).toBe(true);
  expect(arrow['lockScalingY']).toBe(true);
  expect(arrow['hasBorders']).toBe(false);
  expect(arrow['hasControls']).toBe(false);
});

function runArrowStateSuite() {
  registerResolveHandlePointTest();
  registerPickDefinedOptionsTest();
  registerFallbackPointBuildTest();
  registerApplyCurveStateTest();
  registerApplyStraightStateTest();
}
describe('object-factory arrow state seam', runArrowStateSuite);
