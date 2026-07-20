import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArrowPathInstance } from './controls.types';
import { normalizeScaledArrowGeometry } from './transform';

interface TestArrow {
  pathOffset: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  set: ReturnType<typeof vi.fn>;
}

function createArrow(overrides: Partial<TestArrow> = {}): TestArrow {
  return {
    pathOffset: { x: 5, y: 5 },
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(),
    ...overrides,
  };
}

const taperedSettings = {
  color: '#f60',
  endHead: 'triangle' as const,
  mode: 'straight' as const,
  opacity: 1,
  shadow: 0,
  startHead: 'none' as const,
  variant: 'tapered' as const,
  width: 6,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('arrow transform', () => {
  registerNoScaleTest();
  registerScaledArrowTest();
  registerCollapsedArrowTest();
  registerMissingPathOffsetTest();
});

function registerNoScaleTest() {
  it('returns false when arrows are already normalized', () => {
    const arrow = createArrow();
    const updateArrowObject = vi.fn();

    expect(
      normalizeScaledArrowGeometry(
        arrow as unknown as ArrowPathInstance,
        taperedSettings,
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        updateArrowObject
      )
    ).toBe(false);
    expect(updateArrowObject).not.toHaveBeenCalled();
  });
}

function registerScaledArrowTest() {
  it('bakes arrow resize-box scaling into authoritative points without changing width', () => {
    const arrow = createArrow({
      scaleX: 2,
      scaleY: 3,
    });
    const updateArrowObject = vi.fn();

    expect(
      normalizeScaledArrowGeometry(
        arrow as unknown as ArrowPathInstance,
        taperedSettings,
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        updateArrowObject
      )
    ).toBe(true);
    expect(arrow.set.mock.invocationCallOrder[0]).toBeLessThan(
      updateArrowObject.mock.invocationCallOrder[0] ?? 0
    );
    expect(updateArrowObject).toHaveBeenCalledWith(arrow, {
      points: [
        { x: -5, y: -10 },
        { x: 15, y: -10 },
      ],
      settings: {
        ...taperedSettings,
        width: 6,
      },
    });
    expect(arrow.set).toHaveBeenCalledWith({ scaleX: 1, scaleY: 1 });
  });
}

function registerCollapsedArrowTest() {
  it('resets arrow scale even when the stored geometry has collapsed to one point', () => {
    const arrow = createArrow({
      scaleX: 2,
      scaleY: 3,
    });
    const updateArrowObject = vi.fn();

    expect(
      normalizeScaledArrowGeometry(
        arrow as unknown as ArrowPathInstance,
        taperedSettings,
        [
          { x: 10, y: 10 },
          { x: 10, y: 10 },
        ],
        updateArrowObject
      )
    ).toBe(true);
    expect(updateArrowObject).toHaveBeenCalledWith(arrow, {
      points: [
        { x: 15, y: 20 },
        { x: 15, y: 20 },
      ],
      settings: {
        ...taperedSettings,
        width: 6,
      },
    });
    expect(arrow.set).toHaveBeenCalledWith({ scaleX: 1, scaleY: 1 });
  });
}

function registerMissingPathOffsetTest() {
  it('uses document-space origin when legacy test doubles omit path offset metadata', () => {
    const arrow = createArrow({
      pathOffset: undefined as never,
      scaleX: 2,
      scaleY: 2,
    });
    const updateArrowObject = vi.fn();

    expect(
      normalizeScaledArrowGeometry(
        arrow as unknown as ArrowPathInstance,
        taperedSettings,
        [
          { x: 2, y: 3 },
          { x: 4, y: 5 },
        ],
        updateArrowObject
      )
    ).toBe(true);
    expect(updateArrowObject).toHaveBeenCalledWith(
      arrow,
      expect.objectContaining({
        points: [
          { x: 4, y: 6 },
          { x: 8, y: 10 },
        ],
      })
    );
  });
}
